"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rfqImageSrc } from "@/lib/rfq/rfqMediaUrl";

/**
 * Lazy RFQ image with thumb fallback chain on error.
 * Default chain: primary → fallbackSrcs → fallbackSrc (legacy prop).
 * Uses IntersectionObserver — only sets src when near viewport.
 */
export default function RfqLazyImage({
  src,
  fallbackSrc,
  fallbackSrcs = [],
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

  const primary = String(src || "").trim();
  const chainKey = useMemo(() => {
    const parts = [primary, ...fallbackSrcs, fallbackSrc].map((u) => String(u || "").trim());
    return parts.join("\0");
  }, [primary, fallbackSrc, fallbackSrcs]);

  const chain = useMemo(() => {
    const list = [];
    const add = (raw) => {
      const resolved = rfqImageSrc(raw) || String(raw || "").trim();
      if (resolved && !list.includes(resolved)) list.push(resolved);
    };
    add(primary);
    for (const fb of fallbackSrcs) add(fb);
    if (fallbackSrc) add(fallbackSrc);
    return list;
  }, [chainKey, primary, fallbackSrc, fallbackSrcs]);

  useEffect(() => {
    setChainIndex(0);
    setCurrentSrc("");
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

  function onError() {
    setChainIndex((i) => {
      if (i + 1 < chain.length) return i + 1;
      return i;
    });
  }

  if (!primary) return null;

  return (
    <img
      ref={imgRef}
      src={currentSrc || undefined}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onError={onError}
      {...rest}
    />
  );
}
