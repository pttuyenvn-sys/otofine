"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_BASE, API_ORIGIN, ZALO_OA_URL } from "@/lib/config";
import { ZaloOaBuyerInlineHint, ZaloOaBuyerMobileStickyBar } from "@/components/rfq/ZaloOaCtas";
import RfqConversationTimeline from "@/components/rfq/RfqConversationTimeline";
import RfqMessageComposer from "@/components/rfq/RfqMessageComposer";
import { useBuyerConversationMessages } from "@/hooks/useRfqConversationMessages";

const LINE_LABEL = {
  oem: "Chính hãng",
  aftermarket: "Thay thế",
  used: "Hàng tháo",
  other: "Khác",
  unknown: "",
};

function imgSrc(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("http")) return u;
  return `${API_ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`;
}

/** Derive buyer-facing copy from RFQ payload (no new APIs). */
function deriveBuyerUx(data) {
  const st = data?.status || "";
  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  const n = quotes.length;
  let expiresMs = NaN;
  if (data?.expiresAt) {
    expiresMs = new Date(data.expiresAt).getTime();
  }
  const expiredByTime = Number.isFinite(expiresMs) && expiresMs < Date.now();
  const expired = st === "expired" || expiredByTime;
  const cancelled = st === "cancelled";

  let headline = "Yêu cầu báo giá";
  let sub = "";
  let tone = "neutral";

  if (cancelled) {
    headline = "Yêu cầu đã huỷ";
    sub = "Không còn nhận báo giá.";
    tone = "muted";
  } else if (expired) {
    headline = "RFQ đã hết hạn";
    sub = "Liên hệ hotline hoặc gửi yêu cầu mới nếu bạn vẫn cần linh kiện.";
    tone = "warn";
  } else if (n > 0 && (st === "dispatching" || st === "open")) {
    headline = `Đã có ${n} báo giá`;
    sub = "Shop khác vẫn có thể gửi thêm trong lúc này.";
    tone = "live";
  } else if (n > 0) {
    headline = `Đã có ${n} báo giá`;
    sub = st === "quoted" ? "Xem và so sánh bên dưới." : "Cập nhật theo thời gian thực.";
    tone = "success";
  } else if (st === "dispatching") {
    headline = "Đang kết nối cửa hàng";
    sub =
      "Shop đang xem tin — báo giá sẽ hiện ngay khi có. Nếu vẫn chưa có giá sau vài phút, Otofine tự động mời thêm cửa hàng phù hợp.";
    tone = "live";
  } else if (st === "open") {
    headline = "Đã nhận yêu cầu";
    sub =
      "Đang chọn cửa hàng phù hợp — có thể mời thêm cửa hàng trong lúc chờ báo giá.";
    tone = "live";
  } else if (st === "quoted") {
    headline = "Đã có báo giá";
    sub = "";
    tone = "success";
  } else if (st === "closed") {
    headline = "Đã đóng yêu cầu";
    sub = "Cảm ơn bạn đã dùng Otofine.";
    tone = "muted";
  }

  const timeline = [];
  timeline.push({
    key: "sent",
    title: "Đã gửi",
    desc: "Otofine đã nhận mô tả linh kiện.",
    done: true,
    current: false,
  });

  if (!cancelled && !expired) {
    const matchingDone = n > 0 || st === "quoted" || st === "closed";
    timeline.push({
      key: "match",
      title: "Shop đang xử lý",
      desc: n > 0 ? "Đã có shop phản hồi — có thể thêm báo giá." : "Ưu tiên shop online — chờ vài phút.",
      done: matchingDone,
      current: !matchingDone && (st === "open" || st === "dispatching"),
    });
    timeline.push({
      key: "quotes",
      title: "Báo giá",
      desc: n ? `${n} shop đã gửi giá.` : "Chưa có báo giá — kéo xuống xem khi có.",
      done: n > 0,
      current: n === 0 && (st === "open" || st === "dispatching"),
    });
  }

  return { headline, sub, tone, expired, cancelled, timeline, quoteCount: n };
}

/** Terminal states: stop polling (no websocket; GET by-token only). */
function isBuyerPollingTerminated(d) {
  if (!d) return true;
  const st = String(d.status || "");
  if (st === "cancelled" || st === "closed") return true;
  if (st === "expired") return true;
  if (d.expiresAt) {
    const t = new Date(d.expiresAt).getTime();
    if (Number.isFinite(t) && t < Date.now()) return true;
  }
  return false;
}

/** Relative label — dòng “vài giây…” khi &lt; 10 giây; làm tươi nhờ `tick`. */
function formatSyncedAgo(lastSyncedMs) {
  if (lastSyncedMs == null || !Number.isFinite(lastSyncedMs)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - lastSyncedMs) / 1000));
  if (sec < 10) return "vài giây trước";
  if (sec < 60) return `${sec} giây trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  return `${h} giờ trước`;
}

export default function RfqTokenPage() {
  const params = useParams();
  const token = decodeURIComponent(params.token || "");
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [tick, setTick] = useState(0);
  const initialFetchDisposedRef = useRef(false);

  useEffect(() => {
    initialFetchDisposedRef.current = false;
    async function load() {
      setLoading(true);
      setMsg("");
      setLastSyncedAt(null);
      try {
        const res = await axios.get(`${API_BASE}/rfq/by-token`, {
          headers: { "X-RFQ-Viewer-Token": token },
        });
        if (initialFetchDisposedRef.current) return;
        setData(res.data);
        setLastSyncedAt(Date.now());
      } catch {
        if (!initialFetchDisposedRef.current) setMsg("Không tải được RFQ — kiểm tra link hoặc liên hệ hỗ trợ.");
      } finally {
        if (!initialFetchDisposedRef.current) setLoading(false);
      }
    }
    if (token) load();
    else setLoading(false);
    return () => {
      initialFetchDisposedRef.current = true;
    };
  }, [token]);

  const ux = useMemo(() => (data ? deriveBuyerUx(data) : null), [data]);

  /** Chừa chỗ sticky OA mobile — không đè lên danh sách báo giá */
  const showOaComfort = Boolean(ZALO_OA_URL && data && ux && !ux.cancelled && !ux.expired && !loading && !msg);

  const sortedQuotes = useMemo(() => {
    const q = data?.quotes ? [...data.quotes] : [];
    q.sort((a, b) => Number(a.priceAmount) - Number(b.priceAmount));
    return q;
  }, [data]);

  const timelineRefreshKey = `${sortedQuotes.length}-${lastSyncedAt ?? 0}`;
  const {
    items: timelineItems,
    loading: timelineLoading,
    error: timelineError,
    reload: reloadTimeline,
    sendText,
    unreadByDispatch,
    totalUnread,
    dispatchIds: timelineDispatchIds,
    listRef: timelineListRef,
    stickToBottomRef: timelineStickRef,
  } = useBuyerConversationMessages(token, sortedQuotes, timelineRefreshKey);

  const messageDispatchOptions = useMemo(() => {
    const seen = new Set();
    const opts = [];
    for (const q of sortedQuotes) {
      const id = Number(q.dispatchId);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      opts.push({
        dispatchId: id,
        shopName: q.shopName || `Shop #${q.id}`,
      });
    }
    return opts;
  }, [sortedQuotes]);

  const [messageDispatchId, setMessageDispatchId] = useState(null);

  useEffect(() => {
    if (!messageDispatchOptions.length) {
      setMessageDispatchId(null);
      return;
    }
    setMessageDispatchId((prev) => {
      if (prev != null && messageDispatchOptions.some((o) => o.dispatchId === prev)) {
        return prev;
      }
      return messageDispatchOptions[0].dispatchId;
    });
  }, [messageDispatchOptions]);

  const canSendBuyerMessage = Boolean(
    messageDispatchId &&
      token &&
      data &&
      !msg &&
      !loading &&
      ux &&
      !ux.cancelled &&
      !ux.expired,
  );

  const pollingActive = Boolean(token && data && !msg && !loading && !isBuyerPollingTerminated(data));

  const syncRelative = useMemo(() => formatSyncedAgo(lastSyncedAt), [lastSyncedAt, tick]);

  useEffect(() => {
    if (!pollingActive || !token) return undefined;

    let pollIntervalId = null;
    let tickIntervalId = null;

    async function silentFetch() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await axios.get(`${API_BASE}/rfq/by-token`, {
          headers: { "X-RFQ-Viewer-Token": token },
        });
        setData(res.data);
        setLastSyncedAt(Date.now());
        if (isBuyerPollingTerminated(res.data)) clearTimersOnly();
      } catch {
        /* giữ nguyên UI + lastSyncedAt khi poll lỗi mạng tạm thời */
      }
    }

    function clearTimersOnly() {
      if (pollIntervalId != null) {
        window.clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
      if (tickIntervalId != null) {
        window.clearInterval(tickIntervalId);
        tickIntervalId = null;
      }
    }

    function startIntervalsIfVisible() {
      clearTimersOnly();
      if (document.visibilityState !== "visible") return;
      pollIntervalId = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void silentFetch();
      }, 5000);
      tickIntervalId = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        setTick((n) => n + 1);
      }, 1000);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        clearTimersOnly();
        return;
      }
      void silentFetch();
      startIntervalsIfVisible();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    startIntervalsIfVisible();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimersOnly();
    };
  }, [token, pollingActive]);

  return (
    <div className="rfq-buyer-page">
      {loading && (
        <div className="rfq-buyer-inner" aria-busy="true">
          <div className="rfq-skel rfq-skeleton--hero" />
          <div className="rfq-skel rfq-skeleton--line" />
          <div className="rfq-skel rfq-skeleton--line rfq-skeleton--short" />
          <div className="rfq-skel rfq-skeleton--timeline" />
          <div className="rfq-skel rfq-skeleton--card" />
          <div className="rfq-skel rfq-skeleton--card" />
        </div>
      )}

      {!loading && msg && (
        <div className="rfq-buyer-inner">
          <div className="rfq-banner-error rfq-buyer-banner">{msg}</div>
          <p className="muted rfq-buyer-foot">
            <Link href="/">← Về trang chủ</Link>
          </p>
        </div>
      )}

      {!loading && data && ux && (
        <>
          <div className={`rfq-buyer-inner${showOaComfort ? " rfq-buyer-inner--oa-pad-mobile" : ""}`}>
          <header className={`rfq-buyer-hero rfq-buyer-hero--${ux.tone}`}>
            <p className="rfq-buyer-kicker">RFQ · #{data.publicId?.slice(0, 8) || "········"}</p>
            <h1 className="rfq-buyer-title">{ux.headline}</h1>
            {ux.sub && <p className="rfq-buyer-sub">{ux.sub}</p>}
            <ZaloOaBuyerInlineHint />
            <div className="rfq-buyer-status-row">
              <span className={`rfq-buyer-pill rfq-buyer-pill--${ux.tone}`}>{statusShortVi(data.status)}</span>
              {data.expiresAt && !ux.expired && !ux.cancelled && (
                <span className="rfq-buyer-expiry muted">Hết hạn link: {formatExpiryHint(data.expiresAt)}</span>
              )}
            </div>
            {lastSyncedAt != null && syncRelative && (
              <p className="rfq-buyer-sync" aria-live="polite">
                Đã cập nhật {syncRelative}
              </p>
            )}
          </header>

          {ux.timeline.length > 0 && (
            <section className="rfq-buyer-section" aria-label="Tiến trình">
              <h2 className="rfq-buyer-h2">Tiến trình</h2>
              <ol className="rfq-timeline">
                {ux.timeline.map((step) => (
                  <li
                    key={step.key}
                    className={`rfq-timeline__step ${step.done ? "rfq-timeline__step--done" : ""} ${step.current ? "rfq-timeline__step--current" : ""}`}
                  >
                    <span className="rfq-timeline__dot" aria-hidden />
                    <div className="rfq-timeline__body">
                      <strong className="rfq-timeline__title">{step.title}</strong>
                      <span className="rfq-timeline__desc">{step.desc}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="rfq-buyer-section">
            <h2 className="rfq-buyer-h2">Chi tiết yêu cầu</h2>
            <div className="rfq-buyer-desc-card card">
              <p className="rfq-buyer-part">{data.partDescription}</p>
              {Array.isArray(data.images) && data.images.length > 0 && (
                <div className="rfq-buyer-images">
                  {data.images.map((src, i) => (
                    <a key={i} href={imgSrc(src)} target="_blank" rel="noreferrer" className="rfq-buyer-thumb-wrap">
                      <img src={imgSrc(src)} alt={`Ảnh ${i + 1}`} className="rfq-buyer-thumb" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rfq-buyer-section" id="quotes">
            <div className="rfq-buyer-quotes-head">
              <h2 className="rfq-buyer-h2">Báo giá nhận được</h2>
              {sortedQuotes.length > 1 && (
                <span className="muted rfq-buyer-sort-hint">Đã xếp theo giá thấp → cao</span>
              )}
            </div>

            {sortedQuotes.length === 0 && !ux.expired && !ux.cancelled && (
              <div className="rfq-buyer-empty card">
                <p className="rfq-buyer-empty-title">Đang chờ báo giá</p>
                <p className="muted rfq-buyer-empty-text">
                  Shop đang xem yêu cầu của bạn. Giữ tab này — danh sách cập nhật ngay khi có giá.
                </p>
              </div>
            )}

            {sortedQuotes.length === 0 && ux.expired && (
              <div className="rfq-buyer-empty card rfq-buyer-empty--warn">
                <p className="rfq-buyer-empty-title">Không còn nhận báo giá mới</p>
                <p className="muted rfq-buyer-empty-text">RFQ đã quá hạn trên hệ thống.</p>
              </div>
            )}

            <ul className="rfq-buyer-quote-list">
              {sortedQuotes.map((q, idx) => (
                <li key={q.id} className={`rfq-quote-card-buyer card ${idx === 0 ? "rfq-quote-card-buyer--best" : ""}`}>
                  {idx === 0 && sortedQuotes.length > 1 && (
                    <span className="rfq-quote-card-buyer__badge">Giá thấp nhất hiện tại</span>
                  )}
                  <div className="rfq-quote-card-buyer__top">
                    <strong className="rfq-quote-card-buyer__shop">{q.shopName || `Shop #${q.id}`}</strong>
                    {q.lineType && q.lineType !== "unknown" && (
                      <span className="rfq-quote-card-buyer__line">{LINE_LABEL[q.lineType] || q.lineType}</span>
                    )}
                  </div>
                  <div className="rfq-quote-card-buyer__price">
                    {Number(q.priceAmount).toLocaleString("vi-VN")} <span className="rfq-quote-card-buyer__cur">{q.currency || "VND"}</span>
                  </div>
                  {q.note && <p className="rfq-quote-card-buyer__note muted">{q.note}</p>}
                </li>
              ))}
            </ul>
          </section>

          <section
            className={`rfq-buyer-section rfq-buyer-chat ${showOaComfort ? "rfq-buyer-chat--oa-pad" : ""}`}
            aria-label="Trao đổi với shop"
          >
            <h2 className="rfq-buyer-h2">
              Trao đổi với shop
              {totalUnread > 0 && (
                <span className="rfq-chat-unread-badge" title="Tin nhắn chưa đọc">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </h2>
            <p className="muted rfq-buyer-conv-hint">
              Tin nhắn + báo giá theo từng shop — cập nhật định kỳ khi tab đang mở (chưa realtime). Giá chính thức vẫn ở danh sách phía trên.
            </p>
            <RfqConversationTimeline
              items={timelineItems}
              loading={timelineLoading}
              error={timelineError}
              onRetry={reloadTimeline}
              showShopLabel
              viewerRole="buyer"
              listRef={timelineListRef}
              stickToBottomRef={timelineStickRef}
              emptyTitle="Chưa có tin nhắn"
              emptyHint={
                sortedQuotes.length > 0
                  ? "Gửi tin nhắn cho shop hoặc đợi báo giá xuất hiện tại đây."
                  : "Chưa có shop báo giá — nhắn tin sẽ khả dụng khi có kết nối shop."
              }
              noQuotesHint={
                sortedQuotes.length === 0 && !ux.expired && !ux.cancelled
                  ? "Chưa có báo giá từ shop nào."
                  : null
              }
            />
            {sortedQuotes.length > 0 && timelineDispatchIds.length === 0 && !timelineLoading && (
              <p className="muted rfq-buyer-conv-note">
                Báo giá hiển thị ở trên; lịch sử chi tiết sẽ có với các báo giá mới.
              </p>
            )}
            {messageDispatchOptions.length > 1 && (
              <label className="rfq-buyer-chat__target">
                <span className="rfq-buyer-chat__target-label">Nhắn tới</span>
                <select
                  className="rfq-buyer-chat__select"
                  value={messageDispatchId ?? ""}
                  onChange={(e) => setMessageDispatchId(Number(e.target.value))}
                  disabled={!canSendBuyerMessage}
                >
                  {messageDispatchOptions.map((o) => {
                    const n = Number(unreadByDispatch?.[o.dispatchId] ?? 0);
                    return (
                      <option key={o.dispatchId} value={o.dispatchId}>
                        {o.shopName}
                        {n > 0 ? ` (${n > 9 ? "9+" : n} chưa đọc)` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
            <RfqMessageComposer
              sticky
              className={showOaComfort ? "rfq-msg-composer--above-oa" : ""}
              disabled={!canSendBuyerMessage}
              placeholder={
                messageDispatchOptions.length === 1
                  ? `Nhắn ${messageDispatchOptions[0]?.shopName || "shop"}…`
                  : "Nhắn shop đã chọn…"
              }
              onSend={(text) => sendText(messageDispatchId, text)}
            />
          </section>

          <p className="muted rfq-buyer-foot">
            <Link href="/">← Trang chủ Otofine</Link>
          </p>
          </div>

          {showOaComfort && <ZaloOaBuyerMobileStickyBar />}
        </>
      )}
    </div>
  );
}

function statusShortVi(st) {
  const m = {
    pending_otp: "Chờ OTP",
    open: "Đang xử lý",
    dispatching: "Đang kết nối shop",
    quoted: "Đã có báo giá",
    closed: "Đã đóng",
    expired: "Hết hạn",
    cancelled: "Đã huỷ",
  };
  return m[st] || st || "—";
}

function formatExpiryHint(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
