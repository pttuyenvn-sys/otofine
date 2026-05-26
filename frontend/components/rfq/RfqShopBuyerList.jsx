"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  buildInboxRowMessagePreview,
  buildInboxRowPart,
  buildInboxRowStatusPill,
  buildInboxRowVehicle,
  formatInboxRelativeTime,
  inboxRowIsNew,
  inboxRowUnread,
} from "@/lib/rfq/rfqShopInboxRow";
import { inboxRowFingerprint } from "@/lib/rfq/rfqInboxListStable";
import { BUYER_INTENT_TIER_META, deriveBuyerIntent } from "@/lib/rfq/buyerIntent";

const RfqShopBuyerRow = memo(
  function RfqShopBuyerRow({ row, active, useLinks, onSelect }) {
    const id = Number(row.id);
    const unread = inboxRowUnread(row);
    const isNew = inboxRowIsNew(row);
    const chatUnread = Number(row.message_unread_count ?? 0);
    const part = buildInboxRowPart(row);
    const vehicle = buildInboxRowVehicle(row);
    const message = buildInboxRowMessagePreview(row);
    const pill = buildInboxRowStatusPill(row);
    const time = useMemo(() => formatInboxRelativeTime(row.updated_at), [row.updated_at]);
    const hasImages = Number(row.image_count ?? 0) > 0;
    // Sales-intelligence: derive priority tier + buyer signals once
    // per row from the same row payload the rest of this component
    // already reads. The derivation is pure so memoising on row
    // identity is sufficient (the outer React.memo guards rerender).
    const intent = useMemo(() => deriveBuyerIntent(row), [row]);
    const tierMeta = BUYER_INTENT_TIER_META[intent.tier] || null;

    const className = [
      "rfq-shop-buyer-list__row",
      active ? "rfq-shop-buyer-list__row--active" : "",
      unread ? "rfq-shop-buyer-list__row--unread" : "",
      `rfq-shop-buyer-list__row--intent-${intent.tier}`,
    ]
      .filter(Boolean)
      .join(" ");

    const inner = (
      <>
        <div className="rfq-inbox-row__head">
          <span className="rfq-inbox-row__part">{part}</span>
          <span className="rfq-inbox-row__head-meta">
            {tierMeta && intent.tier !== "cold" ? (
              <span
                className={`rfq-inbox-row__pill rfq-inbox-row__pill--intent-${intent.tier}`}
                title={tierMeta.title}
              >
                <span aria-hidden style={{ marginRight: 3 }}>{tierMeta.glyph}</span>
                {tierMeta.label}
              </span>
            ) : null}
            {pill ? (
              <span className={`rfq-inbox-row__pill rfq-inbox-row__pill--${pill.tone}`}>
                {pill.label}
              </span>
            ) : null}
            {time ? <span className="rfq-inbox-row__time">{time}</span> : null}
          </span>
        </div>

        {vehicle ? <span className="rfq-inbox-row__vehicle">{vehicle}</span> : null}

        {intent.badges.length > 0 ? (
          <div className="rfq-inbox-row__signals" aria-label="Tín hiệu khách hàng">
            {intent.badges.map((b) => (
              <span
                key={b.key}
                className={`rfq-inbox-row__signal rfq-inbox-row__signal--${b.tone}`}
                title={b.title || b.label}
              >
                <span aria-hidden style={{ marginRight: 2 }}>{b.glyph}</span>
                {b.label}
              </span>
            ))}
          </div>
        ) : null}

        {message ? (
          <div className="rfq-inbox-row__preview">
            {message.who ? (
              <span className="rfq-inbox-row__preview-who">{message.who}:</span>
            ) : null}
            <span className="rfq-inbox-row__preview-text">
              {message.quoted ? `"${message.text}"` : message.text}
            </span>
            {hasImages ? (
              <span className="rfq-inbox-row__attach" aria-label="Có ảnh đính kèm">
                📎
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="rfq-inbox-row__foot">
          {unread ? (
            <span className="rfq-inbox-row__new">
              {isNew ? (
                <>
                  <span className="rfq-inbox-row__new-dot" aria-hidden />
                  mới
                </>
              ) : null}
              {chatUnread > 0 ? (
                <span className="rfq-inbox-row__count">
                  {chatUnread > 99 ? "99+" : chatUnread}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="rfq-inbox-row__foot-spacer" aria-hidden />
          )}
        </div>
      </>
    );

    if (useLinks && !onSelect) {
      return (
        <Link href={`/rfq/shop/${row.id}`} className={className} role="option" aria-selected={active}>
          {inner}
        </Link>
      );
    }

    return (
      <button
        type="button"
        className={className}
        role="option"
        aria-selected={active}
        onClick={() => onSelect?.(id)}
      >
        {inner}
      </button>
    );
  },
  (prev, next) => {
    if (prev.active !== next.active) return false;
    if (prev.useLinks !== next.useLinks) return false;
    if (prev.onSelect !== next.onSelect) return false;
    if (prev.row === next.row) return true;
    return inboxRowFingerprint(prev.row) === inboxRowFingerprint(next.row);
  },
);

export default memo(RfqShopBuyerList, (a, b) => {
  return (
    a.items === b.items &&
    a.activeDispatchId === b.activeDispatchId &&
    a.onSelect === b.onSelect &&
    a.variant === b.variant &&
    a.useLinks === b.useLinks &&
    a.listRef === b.listRef
  );
});

function RfqShopBuyerList({
  items = [],
  activeDispatchId = null,
  onSelect,
  variant = "sidebar",
  useLinks = true,
  listRef = null,
}) {
  const internalRef = useRef(null);
  const scrollRef = listRef || internalRef;
  const scrollTopRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const saveScroll = () => {
      scrollTopRef.current = el.scrollTop;
    };
    el.addEventListener("scroll", saveScroll, { passive: true });
    return () => el.removeEventListener("scroll", saveScroll);
  }, [scrollRef]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || scrollTopRef.current <= 0) return;
    el.scrollTop = scrollTopRef.current;
  }, [items, scrollRef]);

  if (!items.length) {
    return (
      <p className="rfq-shop-buyer-list__empty muted">Không có RFQ ở bộ lọc này</p>
    );
  }

  return (
    <ul
      ref={scrollRef}
      className={`rfq-shop-buyer-list rfq-shop-buyer-list--${variant}`}
      role="listbox"
      aria-label="Danh sách khách"
    >
      {items.map((row) => {
        const id = Number(row.id);
        const active = activeDispatchId != null && Number(activeDispatchId) === id;

        return (
          <li key={row.id} role="presentation">
            <RfqShopBuyerRow
              row={row}
              active={active}
              useLinks={useLinks}
              onSelect={onSelect}
            />
          </li>
        );
      })}
    </ul>
  );
}
