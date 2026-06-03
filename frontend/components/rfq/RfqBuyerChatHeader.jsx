"use client";

import { memo, useState } from "react";
import { RFQ_MEDIA_VARIANT } from "@/lib/rfq/rfqMediaUrl";
import { normalizeMergedPartDescription } from "@/lib/rfq/rfqPartDescription";
import RfqImageLightbox from "@/components/rfq/RfqImageLightbox";
import RfqLazyImage from "@/components/rfq/RfqLazyImage";
import RfqHistoryEntryLink from "@/components/rfq/RfqHistoryEntryLink";

/**
 * Compact sticky context for buyer chat (part primary, vehicle secondary).
 */
export default memo(RfqBuyerChatHeader, (a, b) => {
  return (
    a.data === b.data &&
    a.totalUnread === b.totalUnread &&
    a.activeShopName === b.activeShopName &&
    a.compact === b.compact
  );
});

function RfqBuyerChatHeader({
  data,
  totalUnread = 0,
  activeShopName = null,
  compact = false,
}) {
  if (!data) return null;

  const vehicle = data.vehicle;
  const vehicleLabel = [vehicle?.brand, vehicle?.model, vehicle?.year]
    .filter(Boolean)
    .join(" · ");
  const partLabel = normalizeMergedPartDescription(data.partDescription);
  const images = Array.isArray(data.images) ? data.images : [];
  const thumbs = compact ? images.slice(0, 2) : images.slice(0, 3);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  return (
    <header className={`rfq-buyer-chat-header ${compact ? "rfq-buyer-chat-header--compact" : ""}`} aria-label="Yêu cầu">
      <div className="rfq-buyer-chat-header__top">
        <p className="rfq-buyer-chat-header__part">{partLabel}</p>
        <div className="rfq-buyer-chat-header__actions">
          {totalUnread > 0 ? (
            <span className="rfq-chat-unread-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
          ) : null}
          <RfqHistoryEntryLink variant="secondary" className="rfq-buyer-chat-header__history" source="rfq_chat" />
        </div>
      </div>
      {vehicleLabel ? (
        <span className="rfq-buyer-chat-header__vehicle">{vehicleLabel}</span>
      ) : null}
      {activeShopName ? (
        <span className="rfq-buyer-chat-header__shop">{activeShopName}</span>
      ) : null}
      {thumbs.length > 0 ? (
        <div className="rfq-buyer-chat-header__thumbs">
          {thumbs.map((src, i) => (
            <button key={i} type="button" onClick={() => setLightboxIndex(i)}>
              <RfqLazyImage
                originalUrl={src}
                variant={RFQ_MEDIA_VARIANT.SMALL}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
          {images.length > thumbs.length ? (
            <span className="rfq-buyer-chat-header__more">+{images.length - thumbs.length}</span>
          ) : null}
        </div>
      ) : null}
      {lightboxIndex != null && images.length > 0 ? (
        <RfqImageLightbox
          urls={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </header>
  );
}
