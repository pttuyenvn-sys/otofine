"use client";

import { memo, useMemo, useState } from "react";
import { attachmentsStable } from "@/lib/rfq/rfqConversationMessages";
import { rfqOriginalSrc, rfqThumbMediumSrc, rfqThumbMediumFallbackSrcs } from "@/lib/rfq/rfqMediaUrl";
import RfqLazyImage from "@/components/rfq/RfqLazyImage";
import RfqImageLightbox from "@/components/rfq/RfqImageLightbox";

function RfqConversationImageGallery({ attachments = [], className = "" }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const attachmentSig = attachmentsStable(attachments);

  const sorted = useMemo(() => {
    if (!attachments?.length) return [];
    return [...attachments].sort(
      (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0),
    );
  }, [attachmentSig, attachments]);

  if (!sorted.length) return null;

  const originalUrls = sorted.map((a) => a.url).filter(Boolean);

  const gridClass =
    sorted.length === 1
      ? "rfq-conv-gallery rfq-conv-gallery--compact rfq-conv-gallery--1"
      : sorted.length === 2
        ? "rfq-conv-gallery rfq-conv-gallery--compact rfq-conv-gallery--2"
        : "rfq-conv-gallery rfq-conv-gallery--compact rfq-conv-gallery--many";

  return (
    <>
      <div className={`${gridClass} ${className}`.trim()} role="group" aria-label="Ảnh đính kèm">
        {sorted.map((att, i) => {
          const original = att.url;
          const mediumResolved = rfqThumbMediumSrc(original, att.thumbnails || null);
          return (
            <button
              key={att.id || att.url}
              type="button"
              className="rfq-conv-gallery__btn"
              onClick={() => setLightboxIndex(i)}
            >
              <RfqLazyImage
                src={mediumResolved}
                fallbackSrcs={rfqThumbMediumFallbackSrcs(original, att.thumbnails || null)}
                className="rfq-conv-gallery__img"
                loading="lazy"
                decoding="async"
              />
            </button>
          );
        })}
      </div>
      {lightboxIndex != null ? (
        <RfqImageLightbox
          urls={originalUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  );
}

export default memo(RfqConversationImageGallery, (a, b) => {
  return (
    a.className === b.className &&
    attachmentsStable(a.attachments) === attachmentsStable(b.attachments)
  );
});
