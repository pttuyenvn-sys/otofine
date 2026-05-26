"use client";

import { useState } from "react";
import Link from "next/link";
import { rfqThumbSmallSrc, rfqThumbSmallFallbackSrcs } from "@/lib/rfq/rfqMediaUrl";
import { buildShopDispatchSummary } from "@/lib/rfq/rfqDispatchSummary";
import RfqImageLightbox from "@/components/rfq/RfqImageLightbox";
import RfqLazyImage from "@/components/rfq/RfqLazyImage";

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
                src={rfqThumbSmallSrc(url)}
                fallbackSrcs={rfqThumbSmallFallbackSrcs(url)}
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
