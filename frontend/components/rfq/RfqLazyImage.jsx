"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRfqMediaFallbackChain,
  RFQ_IMAGE_PLACEHOLDER,
  RFQ_MEDIA_VARIANT,
  rfqImageSrc,
} from "@/lib/rfq/rfqMediaUrl";

/**
 * Lazy RFQ image with unified thumb → original → placeholder fallback.
 * Uses IntersectionObserver — only sets src when near viewport.
 */
export default function RfqLazyImage({
  src,
  originalUrl,
  variant = RFQ_MEDIA_VARIANT.MEDIUM,
  explicitThumbnails = null,
  fallbackSrc,
  fallbackSrcs = [],
  placeholder = RFQ_IMAGE_PLACEHOLDER,
  alt = "",
  className = "",
  rootMargin = "120px",
  loading = "lazy",
  decoding = "async",
  ...rest
}) {
  const imgRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [chainIndex, setChainIndex] = useState(0);
  const [currentSrc, setCurrentSrc] = useState("");
  const exhaustedLogged = useRef(false);

  const chainKey = useMemo(() => {
    if (originalUrl) {
      return getRfqMediaFallbackChain(originalUrl, variant, explicitThumbnails).join("\0");
    }
    const parts = [src, ...fallbackSrcs, fallbackSrc, placeholder].map((u) =>
      String(u || "").trim(),
    );
    return parts.join("\0");
  }, [originalUrl, variant, explicitThumbnails, src, fallbackSrc, fallbackSrcs, placeholder]);

  const chain = useMemo(() => {
    if (originalUrl) {
      const built = getRfqMediaFallbackChain(originalUrl, variant, explicitThumbnails);
      const ph = placeholder || RFQ_IMAGE_PLACEHOLDER;
      if (ph && !built.includes(ph)) built.push(ph);
      return built.filter(Boolean);
    }

    const list = [];
    const add = (raw) => {
      const resolved = rfqImageSrc(raw) || String(raw || "").trim();
      if (resolved && !list.includes(resolved)) list.push(resolved);
    };
    add(src);
    for (const fb of fallbackSrcs) add(fb);
    if (fallbackSrc) add(fallbackSrc);
    add(placeholder || RFQ_IMAGE_PLACEHOLDER);
    return list;
  }, [chainKey, originalUrl, variant, explicitThumbnails, src, fallbackSrc, fallbackSrcs, placeholder]);

  const primary = chain[0] || "";

  useEffect(() => {
    setChainIndex(0);
    setCurrentSrc("");
    exhaustedLogged.current = false;
  }, [chainKey]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || !primary) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [primary, rootMargin]);

  useEffect(() => {
    if (visible && chain[chainIndex]) {
      setCurrentSrc(chain[chainIndex]);
    }
  }, [visible, chainIndex, chain]);

  const atFinal = chainIndex >= chain.length - 1;

  const onError = useCallback(() => {
    setChainIndex((i) => {
      const next = i + 1;
      if (next < chain.length) return next;

      if (process.env.NODE_ENV === "development" && !exhaustedLogged.current) {
        exhaustedLogged.current = true;
        console.debug("[rfq-media] fallback chain exhausted", {
          originalUrl: originalUrl || src,
          variant,
          chain,
        });
      }
      return i;
    });
  }, [chain, originalUrl, src, variant]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    el.onerror = atFinal ? null : onError;
  }, [atFinal, onError, currentSrc]);

  if (!primary) return null;

  return (
    <img
      ref={imgRef}
      src={currentSrc || undefined}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onError={atFinal ? undefined : onError}
      {...rest}
    />
  );
}
