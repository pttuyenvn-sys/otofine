"use client";

import { memo, useCallback, useEffect, useMemo } from "react";
import { formatConversationTimeShort } from "@/lib/rfq/rfqConversationMessages";

const RECENT_ACTIVITY_MS = 30 * 60 * 1000;

function shopInitials(name) {
  const s = String(name || "Shop").trim();
  return s.slice(0, 1).toUpperCase() || "S";
}

function truncate(text, max = 52) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function messagePreview(msg) {
  if (!msg) return "Chưa có tin nhắn";
  if (msg.message_type === "image") return "Ảnh";
  if (msg.message_type === "quote") return "Báo giá";
  if (msg.message_type === "system") return "Hệ thống";
  return truncate(msg.message_text) || "Tin nhắn";
}

export function buildShopActivityMap(timelineItems) {
  const map = {};
  for (const m of timelineItems || []) {
    const id = Number(m.dispatchId);
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(t)) continue;
    if (!map[id] || t >= map[id].ts) {
      map[id] = { ts: t, message: m };
    }
  }
  return map;
}

function sortShopsByActivity(shops, activityByDispatch) {
  return [...shops].sort((a, b) => {
    const ta = activityByDispatch[a.dispatchId]?.ts ?? 0;
    const tb = activityByDispatch[b.dispatchId]?.ts ?? 0;
    if (tb !== ta) return tb - ta;
    return Number(a.dispatchId) - Number(b.dispatchId);
  });
}

export const RfqBuyerShopList = memo(function RfqBuyerShopList({
  shops = [],
  activeDispatchId,
  onSelect,
  unreadByDispatch = {},
  quotesByDispatch = {},
  activityByDispatch = {},
  className = "",
  variant = "drawer",
}) {
  const sorted = useMemo(
    () => sortShopsByActivity(shops, activityByDispatch),
    [shops, activityByDispatch],
  );

  if (!sorted.length) return null;

  return (
    <ul
      className={`rfq-shop-list rfq-shop-list--${variant} ${className}`.trim()}
      role="listbox"
      aria-label="Danh sách shop"
    >
      {sorted.map((s) => {
        const id = s.dispatchId;
        const active = id === activeDispatchId;
        const unread = Number(unreadByDispatch?.[id] ?? 0);
        const quote = quotesByDispatch?.[id];
        const activity = activityByDispatch[id];
        const recent =
          activity?.ts && Date.now() - activity.ts < RECENT_ACTIVITY_MS;

        return (
          <li key={id} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={active}
              className={`rfq-shop-list__row ${active ? "rfq-shop-list__row--active" : ""} ${unread > 0 ? "rfq-shop-list__row--unread" : ""}`}
              onClick={() => onSelect?.(id)}
            >
              <span className="rfq-shop-list__avatar" aria-hidden>
                {shopInitials(s.shopName)}
                {recent ? <span className="rfq-shop-list__dot" aria-hidden /> : null}
              </span>
              <span className="rfq-shop-list__body">
                <span className="rfq-shop-list__top">
                  <span className="rfq-shop-list__name">{s.shopName}</span>
                  {activity?.message?.created_at ? (
                    <time
                      className="rfq-shop-list__time"
                      dateTime={activity.message.created_at}
                    >
                      {formatConversationTimeShort(activity.message.created_at)}
                    </time>
                  ) : null}
                </span>
                <span className="rfq-shop-list__preview">
                  {messagePreview(activity?.message)}
                </span>
                {quote ? (
                  <span className="rfq-shop-list__price">
                    {Number(quote.priceAmount).toLocaleString("vi-VN")}₫
                  </span>
                ) : null}
              </span>
              {unread > 0 ? (
                <span className="rfq-shop-list__badge">{unread > 99 ? "99+" : unread}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
});

function RfqBuyerShopDrawer({
  open,
  onClose,
  shops = [],
  activeDispatchId,
  onSelectDispatch,
  unreadByDispatch = {},
  quotesByDispatch = {},
  timelineItems = [],
}) {
  const activityByDispatch = useMemo(
    () => buildShopActivityMap(timelineItems),
    [timelineItems],
  );

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const handleSelect = useCallback(
    (id) => {
      onSelectDispatch?.(id);
      onClose?.();
    },
    [onSelectDispatch, onClose],
  );

  if (!shops.length) return null;

  return (
    <>
      <button
        type="button"
        className={`rfq-shop-drawer-backdrop ${open ? "rfq-shop-drawer-backdrop--open" : ""}`}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <div
        className={`rfq-shop-drawer ${open ? "rfq-shop-drawer--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="Chọn shop"
      >
        <div className="rfq-shop-drawer__handle" aria-hidden />
        <header className="rfq-shop-drawer__header">
          <h2 className="rfq-shop-drawer__title">Chọn shop</h2>
          <button type="button" className="rfq-shop-drawer__close" onClick={onClose}>
            Đóng
          </button>
        </header>
        <RfqBuyerShopList
          shops={shops}
          activeDispatchId={activeDispatchId}
          onSelect={handleSelect}
          unreadByDispatch={unreadByDispatch}
          quotesByDispatch={quotesByDispatch}
          activityByDispatch={activityByDispatch}
          variant="drawer"
        />
      </div>
    </>
  );
}

export default memo(RfqBuyerShopDrawer, (a, b) => {
  return (
    a.open === b.open &&
    a.shops === b.shops &&
    a.activeDispatchId === b.activeDispatchId &&
    a.onSelectDispatch === b.onSelectDispatch &&
    a.onClose === b.onClose &&
    a.unreadByDispatch === b.unreadByDispatch &&
    a.quotesByDispatch === b.quotesByDispatch &&
    a.timelineItems === b.timelineItems
  );
});
