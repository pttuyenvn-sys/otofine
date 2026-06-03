"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import RfqLazyImage from "@/components/rfq/RfqLazyImage";
import RfqImageLightbox from "@/components/rfq/RfqImageLightbox";
import { buildShopDispatchSummary } from "@/lib/rfq/rfqDispatchSummary";
import { RFQ_MEDIA_VARIANT } from "@/lib/rfq/rfqMediaUrl";
import {
  BUYER_INTENT_TIER_META,
  deriveBuyerIntent,
} from "@/lib/rfq/buyerIntent";

/**
 * Compact chat header — part primary, vehicle secondary (conversation-first).
 */
export default function RfqShopDispatchSummary({
  dispatch,
  chatUnreadCount = 0,
  className = "",
  showBack = true,
}) {
  const s = buildShopDispatchSummary(dispatch);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Sales-intelligence: derive HOT/WARM tier + the compact follow-up
  // hints from the same dispatch row the inbox list reads. Pure
  // derivation, memoised so the chat pane doesn't recompute on every
  // unrelated rerender (timeline polls every few seconds).
  const intent = useMemo(() => {
    if (!dispatch) return null;
    return deriveBuyerIntent({
      ...dispatch,
      message_unread_count: chatUnreadCount,
    });
  }, [dispatch, chatUnreadCount]);
  const tierMeta = intent ? BUYER_INTENT_TIER_META[intent.tier] : null;

  if (!dispatch) return null;

  const thumbs = s.imageUrls.slice(0, 3);
  const more = s.imageCount - thumbs.length;

  return (
    <header
      className={`rfq-shop-chat-header ${className}`.trim()}
      aria-label="Yêu cầu khách"
    >
      {showBack ? (
        <Link href="/rfq/shop/inbox" className="rfq-shop-chat-header__back rfq-mobile-only">
          ← Inbox
        </Link>
      ) : null}
      <div className="rfq-shop-chat-header__top">
        <p className="rfq-shop-chat-header__part">{s.partDescription || "—"}</p>
        {chatUnreadCount > 0 ? (
          <span className="rfq-chat-unread-badge">
            {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
          </span>
        ) : null}
        {s.isUnread ? <span className="rfq-shop-chat-header__new">Mới</span> : null}
      </div>
      {s.vehicleLabel ? (
        <span className="rfq-shop-chat-header__vehicle">{s.vehicleLabel}</span>
      ) : null}

      {intent && intent.tier !== "cold" ? (
        <div
          className={`rfq-shop-chat-header__intent rfq-shop-chat-header__intent--${intent.tier}`}
          aria-label="Tín hiệu khách hàng"
        >
          <div className="rfq-shop-chat-header__intent-head">
            {tierMeta ? (
              <span
                className={`rfq-inbox-row__pill rfq-inbox-row__pill--intent-${intent.tier}`}
                title={tierMeta.title}
              >
                <span aria-hidden style={{ marginRight: 3 }}>{tierMeta.glyph}</span>
                {tierMeta.label}
              </span>
            ) : null}
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
          {intent.reasons.length > 0 ? (
            <ul className="rfq-shop-chat-header__intent-list">
              {intent.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {thumbs.length > 0 ? (
        <div className="rfq-shop-chat-header__thumbs" id="rfq-summary-images">
          {thumbs.map((url, i) => (
            <button
              key={url}
              type="button"
              className="rfq-shop-chat-header__thumb"
              onClick={() => setLightboxIndex(i)}
            >
              <RfqLazyImage
                originalUrl={url}
                variant={RFQ_MEDIA_VARIANT.SMALL}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
          {more > 0 ? (
            <button type="button" className="rfq-shop-chat-header__more" onClick={() => setLightboxIndex(3)}>
              +{more}
            </button>
          ) : null}
        </div>
      ) : null}
      {lightboxIndex != null && s.imageUrls.length > 0 ? (
        <RfqImageLightbox
          urls={s.imageUrls}
          initialIndex={Math.min(lightboxIndex, s.imageUrls.length - 1)}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </header>
  );
}
