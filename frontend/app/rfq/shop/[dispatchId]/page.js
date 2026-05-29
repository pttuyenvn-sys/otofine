"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axiosClient from "@/api/axiosClient";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { API_BASE } from "@/lib/config";
import { buildShopLoginUrl, getCurrentShopReturnPath } from "@/lib/auth/safeShopRedirect";
import { getShopToken } from "@/lib/auth/storage";
import {
  buildShopRfqConversationPath,
  parseShopDispatchId,
  SHOP_RFQ_INBOX_PATH,
} from "@/lib/rfq/rfqShopDeepLink";
import RfqConversationTimeline from "@/components/rfq/RfqConversationTimeline";
import RfqMessageComposer from "@/components/rfq/RfqMessageComposer";
import RfqShopDispatchSummary from "@/components/rfq/RfqShopDispatchSummary";
import RfqShopBuyerList from "@/components/rfq/RfqShopBuyerList";
import RfqShopBuyerDrawer from "@/components/rfq/RfqShopBuyerDrawer";
import { useShopInboxList } from "@/hooks/useShopInboxList";
import { useShopConversationMessages } from "@/hooks/useRfqConversationMessages";
import { shopConversationHeaders } from "@/lib/rfq/rfqConversationApi";
import { SHOP_INBOX_STATUS_FILTERS } from "@/lib/rfq/rfqInboxFilters";

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
  const router = useRouter();
  const dispatchId = params.dispatchId;
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inboxFilter, setInboxFilter] = useState("all");
  const [authRequired, setAuthRequired] = useState(false);
  const submitLock = useRef(false);
  const loginRedirectRef = useRef(false);

  const loginUrl =
    typeof window !== "undefined" ? buildShopLoginUrl(getCurrentShopReturnPath()) : "/shop/login";

  const parsedDispatchId = parseShopDispatchId(dispatchId);

  useEffect(() => {
    if (dispatchId && !parsedDispatchId) {
      router.replace(SHOP_RFQ_INBOX_PATH);
    }
  }, [dispatchId, parsedDispatchId, router]);

  useEffect(() => {
    if (!authRequired || loginRedirectRef.current) return;
    loginRedirectRef.current = true;
    router.replace(buildShopLoginUrl(getCurrentShopReturnPath()));
  }, [authRequired, router]);

  const {
    items: inboxItems,
    messageUnreadTotal,
    loading: inboxLoading,
  } = useShopInboxList({ filter: inboxFilter, sort: "activity" });

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
      setLoadingDetail(true);
      setErrMsg("");
      setAuthRequired(false);

      const token = getShopToken();
      if (!token) {
        setAuthRequired(true);
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
        } else if (err.response?.status === 404) {
          router.replace(SHOP_RFQ_INBOX_PATH);
        } else {
          setErrMsg("Không mở được RFQ — đăng nhập shop hoặc kiểm tra link.");
        }
      } finally {
        setLoadingDetail(false);
      }
    }
    if (dispatchId) load();
  }, [dispatchId]);

  const d = detail?.dispatch;
  const hasQuote = Boolean(detail?.quotes?.some((q) => q.status === "submitted"));

  useEffect(() => {
    setQuoteOpen(false);
  }, [dispatchId]);

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

  const mobileTriggerLabel = useMemo(() => {
    const count = inboxItems.length;
    if (messageUnreadTotal > 0) {
      return `Buyer (${count}) · ${messageUnreadTotal} mới`;
    }
    return `Buyer (${count})`;
  }, [inboxItems.length, messageUnreadTotal]);

  const handleSelectBuyer = useCallback(
    (id) => {
      if (Number(id) !== Number(dispatchId)) {
        router.push(buildShopRfqConversationPath(id));
      }
    },
    [dispatchId, router],
  );

  const handleOpenDrawer = useCallback(() => setDrawerOpen(true), []);
  const handleCloseDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleQuote = useCallback(() => setQuoteOpen((v) => !v), []);

  return (
    <div className="rfq-seller-wide rfq-shop-layout-page">
      {loadingDetail && (
        <div className="rfq-detail-skeleton">
          <div className="rfq-skel rfq-skel--block" />
          <div className="rfq-skel rfq-skel--block rfq-skel--tall" />
        </div>
      )}

      {successMsg && <p className="rfq-banner-success rfq-detail-banner">{successMsg}</p>}
      {authRequired ? (
        <p className="rfq-banner-error rfq-detail-banner">
          Cần{" "}
          <Link href={loginUrl} className="rfq-auth-login-link">
            đăng nhập shop
          </Link>{" "}
          để xem RFQ này.
        </p>
      ) : null}
      {!authRequired && errMsg ? <p className="rfq-banner-error rfq-detail-banner">{errMsg}</p> : null}

      {d && (
        <div className="rfq-shop-chat-viewport">
          <section className="rfq-chat-shell rfq-chat-shell--primary" aria-label="Chat khách">
            <div className="rfq-shop-layout">
              <aside className="rfq-shop-buyer-sidebar rfq-desktop-only" aria-label="Khách hỏi phụ tùng">
                <header className="rfq-shop-buyer-sidebar__head">
                  <h2 className="rfq-shop-buyer-sidebar__title">Buyer hỏi phụ tùng</h2>
                  <span className="rfq-shop-buyer-sidebar__count">{inboxItems.length}</span>
                </header>
                <div className="rfq-shop-buyer-sidebar__filters">
                  <div className="rfq-chip-row rfq-chip-row--compact">
                    {SHOP_INBOX_STATUS_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`rfq-chip rfq-chip--xs ${inboxFilter === f.id ? "rfq-chip--active" : ""}`}
                        onClick={() => setInboxFilter(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                {inboxLoading && !inboxItems.length ? (
                  <p className="muted rfq-shop-buyer-sidebar__loading">Đang tải…</p>
                ) : (
                  <RfqShopBuyerList
                    items={inboxItems}
                    activeDispatchId={dispatchId}
                    variant="sidebar"
                    useLinks
                  />
                )}
              </aside>

              <div className="rfq-shop-chat-column">
                <RfqShopDispatchSummary
                  dispatch={d}
                  chatUnreadCount={chatUnreadCount}
                  showBack={false}
                />

                <button
                  type="button"
                  className="rfq-shop-drawer-trigger rfq-mobile-only"
                  onClick={handleOpenDrawer}
                  aria-haspopup="dialog"
                  aria-expanded={drawerOpen}
                >
                  <span className="rfq-shop-drawer-trigger__icon" aria-hidden>
                    ☰
                  </span>
                  <span className="rfq-shop-drawer-trigger__label">{mobileTriggerLabel}</span>
                  {messageUnreadTotal > 0 ? (
                    <span className="rfq-shop-drawer-trigger__badge">
                      {messageUnreadTotal > 99 ? "99+" : messageUnreadTotal}
                    </span>
                  ) : null}
                </button>

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
                    onClick={toggleQuote}
                    aria-expanded={quoteOpen}
                  >
                    {hasQuote ? "✓ Báo giá" : "💰 Báo giá"}
                  </button>
                  {quoteOpen ? (
                    <div id="rq-quote" className="rfq-shop-quote-bar__panel">
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
                      {detail.quotes?.length > 0 && (
                        <ul className="rfq-quote-history rfq-quote-history--compact">
                          {detail.quotes.map((q) => (
                            <li key={q.id}>
                              <strong>{formatMoney(q.price_amount, q.currency)}</strong>
                              {q.note && <span className="muted"> — {q.note}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
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
                />
              </div>
            </div>
          </section>
        </div>
      )}

      <RfqShopBuyerDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        items={inboxItems}
        activeDispatchId={dispatchId}
        onSelectDispatch={handleSelectBuyer}
      />
    </div>
  );
}
