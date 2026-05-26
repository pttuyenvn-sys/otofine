"use client";

import { memo } from "react";
/**
 * Per-shop thread switcher — one active conversation at a time (buyer).
 */
function RfqBuyerShopTabs({
  shops = [],
  activeDispatchId,
  onSelect,
  unreadByDispatch = {},
  quotesByDispatch = {},
}) {
  if (shops.length <= 1) return null;

  return (
    <div className="rfq-shop-tabs" role="tablist" aria-label="Shop">
      {shops.map((s) => {
        const id = s.dispatchId;
        const active = id === activeDispatchId;
        const unread = Number(unreadByDispatch?.[id] ?? 0);
        const quote = quotesByDispatch?.[id];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`rfq-shop-tab ${active ? "rfq-shop-tab--on" : ""} ${unread > 0 ? "rfq-shop-tab--unread" : ""}`}
            onClick={() => onSelect?.(id)}
          >
            <span className="rfq-shop-tab__name">{s.shopName}</span>
            {quote ? (
              <span className="rfq-shop-tab__price">
                {Number(quote.priceAmount).toLocaleString("vi-VN")}₫
              </span>
            ) : null}
            {unread > 0 ? (
              <span className="rfq-shop-tab__badge">{unread > 9 ? "9+" : unread}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default memo(RfqBuyerShopTabs, (a, b) => {
  return (
    a.shops === b.shops &&
    a.activeDispatchId === b.activeDispatchId &&
    a.onSelect === b.onSelect &&
    a.unreadByDispatch === b.unreadByDispatch &&
    a.quotesByDispatch === b.quotesByDispatch
  );
});
