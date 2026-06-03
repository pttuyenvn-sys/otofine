"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rfqOriginalSrc } from "@/lib/rfq/rfqMediaUrl";
import RfqLazyImage from "@/components/rfq/RfqLazyImage";
import { RFQ_MEDIA_VARIANT } from "@/lib/rfq/rfqMediaUrl";

/**
 * Mobile-first fullscreen image viewer — always loads original/full size.
 */
export default function RfqImageLightbox({ urls = [], initialIndex = 0, onClose }) {
  const safeUrls = urls.map((u) => rfqOriginalSrc(u)).filter(Boolean);
  const [index, setIndex] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, safeUrls.length - 1)),
  );
  const touchRef = useRef({ x: 0, y: 0 });

  const go = useCallback(
    (delta) => {
      if (safeUrls.length <= 1) return;
      setIndex((i) => (i + delta + safeUrls.length) % safeUrls.length);
    },
    [safeUrls.length],
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go]);

  if (!safeUrls.length) return null;

  const originalUrl = urls[index] || urls[0];

  return (
    <div
      className="rfq-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="rfq-lightbox__toolbar">
        <span className="rfq-lightbox__counter">
          {index + 1} / {safeUrls.length}
        </span>
        <button type="button" className="rfq-lightbox__close" onClick={onClose} aria-label="Đóng">
          ✕
        </button>
      </div>

      <div
        className="rfq-lightbox__stage"
        onTouchStart={(e) => {
          const t = e.changedTouches[0];
          touchRef.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0];
          const dx = t.clientX - touchRef.current.x;
          const dy = t.clientY - touchRef.current.y;
          if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
          if (dx < 0) go(1);
          else go(-1);
        }}
      >
        {safeUrls.length > 1 ? (
          <button
            type="button"
            className="rfq-lightbox__nav rfq-lightbox__nav--prev"
            onClick={() => go(-1)}
            aria-label="Ảnh trước"
          >
            ‹
          </button>
        ) : null}

        <div className="rfq-lightbox__zoom-wrap">
          <RfqLazyImage
            key={originalUrl}
            originalUrl={originalUrl}
            variant={RFQ_MEDIA_VARIANT.ORIGINAL}
            className="rfq-lightbox__img"
            decoding="async"
            loading="eager"
          />
        </div>

        {safeUrls.length > 1 ? (
          <button
            type="button"
            className="rfq-lightbox__nav rfq-lightbox__nav--next"
            onClick={() => go(1)}
            aria-label="Ảnh sau"
          >
            ›
          </button>
        ) : null}
      </div>

      {safeUrls.length > 1 ? (
        <div className="rfq-lightbox__dots">
          {safeUrls.map((u, i) => (
            <button
              key={u}
              type="button"
              className={`rfq-lightbox__dot ${i === index ? "rfq-lightbox__dot--on" : ""}`}
              onClick={() => setIndex(i)}
              aria-label={`Ảnh ${i + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
