"use client";

import { useEffect, useRef, useState } from "react";
import axiosClient from "@/api/axiosClient";
import { getShopToken } from "@/lib/auth/storage";
import Link from "next/link";
import { API_BASE } from "@/lib/config";
import { buildShopLoginUrl, getCurrentShopReturnPath } from "@/lib/auth/safeShopRedirect";
import RfqConversationTimeline from "@/components/rfq/RfqConversationTimeline";
import RfqMessageComposer from "@/components/rfq/RfqMessageComposer";
import RfqShopDispatchSummary from "@/components/rfq/RfqShopDispatchSummary";
import { useShopConversationMessages } from "@/hooks/useRfqConversationMessages";
import { shopConversationHeaders } from "@/lib/rfq/rfqConversationApi";
import { sellerQuickRepliesForDispatch } from "@/lib/rfq/sellerQuickReplies";

const LINE_OPTIONS = [
  { value: "oem", label: "Chính hãng (OEM)" },
  { value: "aftermarket", label: "Thương mại / thay thế" },
  { value: "used", label: "Hàng tháo / cũ" },
  { value: "other", label: "Khác" },
];

function formatMoney(n, cur) {
  return `${Number(n).toLocaleString("vi-VN")} ${cur || "VND"}`;
}

export default function RfqShopInboxChatPane({ dispatchId }) {
  const [detail, setDetail] = useState(null);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [lineType, setLineType] = useState("oem");
  const [errMsg, setErrMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timelineRefresh, setTimelineRefresh] = useState(0);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const submitLock = useRef(false);

  const loginUrl =
    typeof window !== "undefined" ? buildShopLoginUrl(getCurrentShopReturnPath()) : "/shop/login";

  const {
    items: timelineItems,
    loading: timelineLoading,
    error: timelineError,
    reload: reloadTimeline,
    sendMessage,
    unreadCount: chatUnreadCount,
    listRef: timelineListRef,
    stickToBottomRef: timelineStickRef,
  } = useShopConversationMessages(dispatchId, timelineRefresh);


  useEffect(() => {
    async function load() {
      if (!dispatchId) return;
      setLoadingDetail(true);
      setErrMsg("");
      setAuthRequired(false);

      const token = getShopToken();
      if (!token) {
        setAuthRequired(true);
        setDetail(null);
        setLoadingDetail(false);
        return;
      }

      try {
        await axiosClient.patch(`/shop/rfq/${dispatchId}/view`, {});
        const res = await axiosClient.get(`/shop/rfq/${dispatchId}`);
        setDetail(res.data);
      } catch (err) {
        if (err.response?.status === 401) {
          setAuthRequired(true);
        } else {
          setErrMsg("Không mở được RFQ — đăng nhập shop hoặc kiểm tra link.");
        }
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    }
    load();
  }, [dispatchId]);

  useEffect(() => {
    setQuoteOpen(false);
    setPrice("");
    setNote("");
    setSuccessMsg("");
    setErrMsg("");
  }, [dispatchId]);

  useEffect(() => {
    if (!successMsg) return undefined;
    const t = setTimeout(() => setSuccessMsg(""), 5500);
    return () => clearTimeout(t);
  }, [successMsg]);

  const d = detail?.dispatch;
  const hasQuote = Boolean(detail?.quotes?.some((q) => q.status === "submitted"));

  async function submitQuote(e) {
    e.preventDefault();
    if (submitLock.current || submitting) return;
    submitLock.current = true;
    setSubmitting(true);
    setErrMsg("");
    try {
      const res = await axiosClient.post(`/shop/rfq/${dispatchId}/quote`, {
        priceAmount: Number(price),
        currency: "VND",
        note,
        lineType,
      });
      const next = await axiosClient.get(`/shop/rfq/${dispatchId}`);
      setDetail(next.data);
      setPrice("");
      setNote("");
      if (res.data?.idempotent) {
        setSuccessMsg("Đã có báo giá — không gửi trùng.");
      } else {
        setSuccessMsg("Đã gửi báo giá — khách thấy trên điện thoại.");
        setTimelineRefresh((n) => n + 1);
      }
      setQuoteOpen(false);
    } catch (err) {
      setErrMsg(err.response?.data?.message || err.response?.data?.code || "Gửi báo giá lỗi — thử lại.");
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  if (!dispatchId) {
    return (
      <div className="rfq-inbox-chat-empty">
        <p className="rfq-inbox-chat-empty__title">Chọn cuộc hội thoại</p>
        <p className="rfq-inbox-chat-empty__hint muted">Nhấn RFQ bên trái để xem chat</p>
      </div>
    );
  }

  if (loadingDetail && !d) {
    return (
      <div className="rfq-inbox-chat-empty rfq-inbox-chat-empty--loading">
        <div className="rfq-skel rfq-skel--block rfq-skel--tall" />
      </div>
    );
  }

  if (!d) {
    return (
      <div className="rfq-inbox-chat-empty">
        {authRequired ? (
          <p className="rfq-banner-error">
            Cần{" "}
            <Link href={loginUrl} className="rfq-auth-login-link">
              đăng nhập shop
            </Link>{" "}
            để xem chat.
          </p>
        ) : (
          <p className="rfq-banner-error">{errMsg || "Không tải được RFQ."}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rfq-shop-chat-column rfq-inbox-chat-pane">
      {successMsg ? <p className="rfq-banner-success rfq-detail-banner">{successMsg}</p> : null}
      {errMsg ? <p className="rfq-banner-error rfq-detail-banner">{errMsg}</p> : null}

      <RfqShopDispatchSummary dispatch={d} chatUnreadCount={chatUnreadCount} showBack={false} />

      <RfqConversationTimeline
        items={timelineItems}
        loading={timelineLoading}
        error={timelineError}
        onRetry={reloadTimeline}
        viewerRole="shop"
        listRef={timelineListRef}
        stickToBottomRef={timelineStickRef}
        emptyTitle="Chưa có tin nhắn"
        emptyHint=""
        hideFootnote
        hideRequestImageSeed
      />

      <div className="rfq-shop-quote-bar">
        <button
          type="button"
          className={`rfq-shop-quote-bar__toggle ${hasQuote ? "rfq-shop-quote-bar__toggle--done" : ""}`}
          onClick={() => setQuoteOpen((v) => !v)}
          aria-expanded={quoteOpen}
        >
          {hasQuote ? "✓ Báo giá" : "💰 Báo giá"}
        </button>
        {quoteOpen ? (
          <div id="rq-quote-inbox" className="rfq-shop-quote-bar__panel">
            <form onSubmit={submitQuote} className="rfq-quote-form rfq-quote-form--compact">
              <label className="rfq-quote-label-price">
                Giá
                <input
                  type="number"
                  inputMode="decimal"
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
                Loại
                <select value={lineType} onChange={(e) => setLineType(e.target.value)} disabled={hasQuote || submitting}>
                  {LINE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Ghi chú"
                disabled={hasQuote || submitting}
                className="rfq-quote-note-field"
              />
              <button
                type="submit"
                className="rfq-btn rfq-btn--primary rfq-btn--block"
                disabled={hasQuote || submitting}
              >
                {submitting ? "Đang gửi…" : hasQuote ? "Đã gửi báo giá" : "Gửi báo giá"}
              </button>
            </form>
            {detail.quotes?.length > 0 ? (
              <ul className="rfq-quote-history rfq-quote-history--compact">
                {detail.quotes.map((q) => (
                  <li key={q.id}>
                    <strong>{formatMoney(q.price_amount, q.currency)}</strong>
                    {q.note ? <span className="muted"> — {q.note}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <RfqMessageComposer
        dispatchId={Number(dispatchId)}
        conversationHeaders={shopConversationHeaders()}
        onSend={(text, opts) => sendMessage(text, opts)}
        placeholder="Nhắn tin cho khách hàng…"
        sticky
        hideHints
        quickReplies={sellerQuickRepliesForDispatch(d)}
      />
    </div>
  );
}
