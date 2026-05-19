"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_BASE } from "@/lib/config";
import RfqConversationTimeline from "@/components/rfq/RfqConversationTimeline";
import RfqMessageComposer from "@/components/rfq/RfqMessageComposer";
import { useShopConversationMessages } from "@/hooks/useRfqConversationMessages";

const LINE_OPTIONS = [
  { value: "oem", label: "Chính hãng (OEM)" },
  { value: "aftermarket", label: "Thương mại / thay thế" },
  { value: "used", label: "Hàng tháo / cũ" },
  { value: "other", label: "Khác" },
];

function formatMoney(n, cur) {
  return `${Number(n).toLocaleString("vi-VN")} ${cur || "VND"}`;
}

export default function RfqSellerDispatchPage() {
  const params = useParams();
  const dispatchId = params.dispatchId;
  const priceRef = useRef(null);
  const [detail, setDetail] = useState(null);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [lineType, setLineType] = useState("oem");
  const [errMsg, setErrMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timelineRefresh, setTimelineRefresh] = useState(0);
  const submitLock = useRef(false);

  const {
    items: timelineItems,
    loading: timelineLoading,
    error: timelineError,
    reload: reloadTimeline,
    sendText,
    unreadCount: chatUnreadCount,
    listRef: timelineListRef,
    stickToBottomRef: timelineStickRef,
  } = useShopConversationMessages(dispatchId, timelineRefresh);

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  });

  useEffect(() => {
    async function load() {
      setLoadingDetail(true);
      setErrMsg("");
      setSuccessMsg("");
      try {
        await axios.patch(`${API_BASE}/shop/rfq/${dispatchId}/view`, {}, { headers: headers() });
        const res = await axios.get(`${API_BASE}/shop/rfq/${dispatchId}`, { headers: headers() });
        setDetail(res.data);
      } catch {
        setErrMsg("Không mở được RFQ — đăng nhập shop hoặc kiểm tra link.");
      } finally {
        setLoadingDetail(false);
      }
    }
    if (dispatchId) load();
  }, [dispatchId]);

  const d = detail?.dispatch;
  const hasQuote = Boolean(detail?.quotes?.some((q) => q.status === "submitted"));

  useEffect(() => {
    if (loadingDetail || hasQuote || !d) return;
    const t = setTimeout(() => {
      priceRef.current?.focus?.();
      priceRef.current?.select?.();
    }, 120);
    return () => clearTimeout(t);
  }, [loadingDetail, hasQuote, d?.id]);

  useEffect(() => {
    if (!successMsg) return undefined;
    const t = setTimeout(() => setSuccessMsg(""), 5500);
    return () => clearTimeout(t);
  }, [successMsg]);

  async function submitQuote(e) {
    e.preventDefault();
    if (submitLock.current || submitting) return;
    submitLock.current = true;
    setSubmitting(true);
    setErrMsg("");
    try {
      const res = await axios.post(
        `${API_BASE}/shop/rfq/${dispatchId}/quote`,
        { priceAmount: Number(price), currency: "VND", note, lineType },
        { headers: headers() },
      );
      const next = await axios.get(`${API_BASE}/shop/rfq/${dispatchId}`, { headers: headers() });
      setDetail(next.data);
      setPrice("");
      setNote("");
      if (res.data?.idempotent) {
        setSuccessMsg("Đã có báo giá — không gửi trùng.");
      } else {
        setSuccessMsg("Đã gửi — khách thấy báo giá ngay trên điện thoại.");
        setTimelineRefresh((n) => n + 1);
      }
    } catch (err) {
      setErrMsg(err.response?.data?.message || err.response?.data?.code || "Gửi báo giá lỗi — thử lại.");
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  const slaMs = d?.respond_by != null ? new Date(d.respond_by).getTime() - Date.now() : null;
  const slaLabel =
    slaMs == null || !Number.isFinite(slaMs)
      ? null
      : slaMs <= 0
        ? "Quá SLA — báo giá web ngay"
        : slaMs < 3600000
          ? `${Math.max(1, Math.ceil(slaMs / 60000))} phút còn lại`
          : `${Math.ceil(slaMs / 3600000)} giờ còn lại`;

  const slaSeverity = slaMs != null && Number.isFinite(slaMs) ? (slaMs <= 0 ? "late" : slaMs < 7200000 ? "soon" : "ok") : null;

  return (
    <div className="rfq-seller-wide rfq-detail-page">
      <div className="rfq-detail-top">
        <div>
          <h1 className="rfq-detail-h1">RFQ · Chi tiết</h1>
          <p className="muted rfq-detail-meta-line">
            #{d?.public_id?.slice(0, 8) || dispatchId}
          </p>
        </div>
        <Link href="/rfq/shop/inbox" className="rfq-btn rfq-btn--ghost rfq-btn--sm rfq-btn--touch">
          ← Inbox
        </Link>
      </div>

      {loadingDetail && (
        <div className="rfq-detail-skeleton">
          <div className="rfq-skel rfq-skel--block rfq-skel--tall" />
          <div className="rfq-skel rfq-skel--block rfq-skel--form" />
        </div>
      )}

      {successMsg && <p className="rfq-banner-success">{successMsg}</p>}
      {errMsg && <p className="rfq-banner-error">{errMsg}</p>}

      {d && (
        <>
          <section className="card rfq-detail-desc">
            <div className="rfq-detail-status-row">
              {slaLabel && slaSeverity && (
                <span className={`rfq-sla rfq-sla--${slaSeverity}`} title="SLA gợi ý">
                  {slaLabel}
                </span>
              )}
              {d.first_viewed_at ? (
                <span className="rfq-pill rfq-pill--seen">Đã xem web</span>
              ) : (
                <span className="rfq-pill rfq-pill--new">Chưa đọc — ưu tiên</span>
              )}
              <span className="rfq-pill rfq-pill--muted">{dispatchStatusVi(d.status)}</span>
            </div>
            <p className="rfq-detail-text">{d.part_description}</p>
          </section>

          <section id="rq-quote" className="card rfq-quote-section rfq-quote-anchor">
            <h2 className="rfq-quote-heading">Báo giá · &lt;10 giây</h2>
            <p className="muted rfq-quote-hint">Nhập giá → chọn loại hàng → Gửi. Khách nhận giá realtime.</p>
            <form onSubmit={submitQuote} className="rfq-quote-form">
              <label className="rfq-quote-label-price">
                Giá (VND)
                <input
                  ref={priceRef}
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  min={1}
                  step={1}
                  className="rfq-quote-price-input"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  disabled={hasQuote || submitting}
                />
              </label>
              <label>
                Loại hàng
                <select value={lineType} onChange={(e) => setLineType(e.target.value)} disabled={hasQuote || submitting}>
                  {LINE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <details className="rfq-quote-note-details">
                <summary className="rfq-quote-note-summary">Ghi chú (tuỳ chọn)</summary>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="VD: BH 6 tháng, có VAT…"
                  disabled={hasQuote || submitting}
                  className="rfq-quote-note-field"
                />
              </details>
              <button type="submit" className="rfq-btn rfq-btn--primary rfq-btn--block rfq-btn--touch-submit" disabled={hasQuote || submitting}>
                {submitting ? (
                  <>
                    <span className="rfq-spinner" aria-hidden />
                    Đang gửi…
                  </>
                ) : hasQuote ? (
                  "Đã gửi báo giá"
                ) : (
                  "Gửi báo giá ngay"
                )}
              </button>
            </form>
          </section>

          <section className="card rfq-quote-sent-card">
            <h2 className="rfq-quote-sent-title">Đã gửi</h2>
            {!detail.quotes?.length && <p className="muted rfq-quote-sent-empty">Chưa có báo giá trên dispatch này.</p>}
            <ul className="rfq-quote-history">
              {detail.quotes?.map((q) => (
                <li key={q.id}>
                  <strong>{formatMoney(q.price_amount, q.currency)}</strong>
                  {q.line_type && q.line_type !== "unknown" && (
                    <span className="rfq-pill rfq-pill--muted">{q.line_type}</span>
                  )}
                  {q.note && <div className="muted">{q.note}</div>}
                </li>
              ))}
            </ul>
          </section>

          <section className="card rfq-conv-section rfq-conv-section--chat">
            <h2 className="rfq-conv-section__title">
              Trao đổi với khách
              {chatUnreadCount > 0 && (
                <span className="rfq-chat-unread-badge">{chatUnreadCount > 99 ? "99+" : chatUnreadCount}</span>
              )}
            </h2>
            <p className="muted rfq-conv-section__hint">
              Tin nhắn + báo giá — cập nhật mỗi vài giây khi tab đang mở (chưa realtime).
            </p>
            <RfqConversationTimeline
              items={timelineItems}
              loading={timelineLoading}
              error={timelineError}
              onRetry={reloadTimeline}
              viewerRole="shop"
              listRef={timelineListRef}
              stickToBottomRef={timelineStickRef}
              emptyTitle="Chưa có tin nhắn"
              emptyHint="Gửi tin nhắn hoặc báo giá để bắt đầu trao đổi."
              noQuotesHint={
                !hasQuote ? "Chưa có báo giá — form báo giá ở trên vẫn dùng như cũ." : null
              }
            />
            <RfqMessageComposer
              onSend={sendText}
              placeholder="Nhắn tin cho khách…"
            />
          </section>

          <div className="rfq-quote-bar" aria-hidden={hasQuote}>
            {!hasQuote && (
              <div className="rfq-quote-bar-inner">
                <span className="rfq-quote-bar-text">{slaLabel || "Phản hồi web trước — hạn chế nhắc Zalo"}</span>
                <a href="#rq-quote" className="rfq-btn rfq-btn--primary rfq-btn--sm rfq-btn--touch">
                  Báo giá
                </a>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function dispatchStatusVi(s) {
  const m = {
    pending: "Chờ gửi",
    web_notified: "Đã vào inbox",
    viewed: "Shop đã xem",
    accepted: "Đã nhận",
    quoted: "Đã báo giá",
    skipped: "Bỏ qua",
    expired: "Hết hạn",
    failed: "Lỗi",
  };
  return m[s] || s || "";
}
