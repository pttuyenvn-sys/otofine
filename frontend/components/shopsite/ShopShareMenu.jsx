"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ShopsiteEvents, trackShopsiteEvent } from "@/lib/shopsite/shopsiteAnalytics";

/**
 * Social share menu for the storefront utility topbar.
 *
 * UX:
 *   - on mobile, if `navigator.share` is available → use the native
 *     Web Share API (one tap, best UX)
 *   - otherwise → small dropdown:
 *       Copy link  · Facebook · Zalo
 *
 * The dropdown closes on outside-click + Escape. The button shows a
 * brief "Đã sao chép!" pill after a successful copy.
 *
 * Analytics: emits SHARE_CLICK on every open and SHARE_COMPLETE /
 * SHARE_COPY on confirmed actions. Future dashboards can compare
 * "share opened" vs "share completed" for a conversion funnel.
 */
export default function ShopShareMenu({ shopName, shopSlug }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef(null);

  // Resolve the canonical URL client-side so subdomain vs apex share
  // is faithful to the user's current host (no hard-coded otofine.com).
  const getShareUrl = useCallback(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin + window.location.pathname;
  }, []);

  const meta = { shopSlug };

  const handleNativeShare = useCallback(async () => {
    trackShopsiteEvent(ShopsiteEvents.SHARE_CLICK, { ...meta, channel: "native" });
    try {
      await navigator.share({
        title: shopName || "Otofine",
        text: shopName ? `${shopName} trên Otofine` : "Shop trên Otofine",
        url: getShareUrl(),
      });
      trackShopsiteEvent(ShopsiteEvents.SHARE_COMPLETE, { ...meta, channel: "native" });
    } catch {
      // User aborted — silently ignore.
    }
  }, [shopName, getShareUrl, meta]);

  const handleCopy = useCallback(async () => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackShopsiteEvent(ShopsiteEvents.SHARE_COPY, { ...meta });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback — synchronous select.
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        trackShopsiteEvent(ShopsiteEvents.SHARE_COPY, { ...meta, via: "fallback" });
        setTimeout(() => setCopied(false), 1800);
      } catch {/* give up silently */}
    }
  }, [getShareUrl, meta]);

  const handleFacebook = useCallback(() => {
    trackShopsiteEvent(ShopsiteEvents.SHARE_CLICK, { ...meta, channel: "facebook" });
    const u = encodeURIComponent(getShareUrl());
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${u}`, "_blank", "noopener,noreferrer,width=600,height=600");
  }, [getShareUrl, meta]);

  const handleZalo = useCallback(() => {
    trackShopsiteEvent(ShopsiteEvents.SHARE_CLICK, { ...meta, channel: "zalo" });
    const u = encodeURIComponent(getShareUrl());
    // Zalo's official web share URL. Falls back to opening Zalo with
    // the URL in the search box on desktops without the app.
    window.open(`https://zalo.me/share/url?u=${u}`, "_blank", "noopener,noreferrer");
  }, [getShareUrl, meta]);

  const handleOpenClick = useCallback(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      handleNativeShare();
      return;
    }
    setOpen((v) => !v);
    trackShopsiteEvent(ShopsiteEvents.SHARE_CLICK, { ...meta, channel: "menu" });
  }, [handleNativeShare, meta]);

  // Outside-click + Escape close the dropdown.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={handleOpenClick}
        className="inline-flex items-center gap-1.5 hover:text-[#e60012] whitespace-nowrap text-gray-600"
        aria-label="Chia sẻ shop"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ShareIcon />
        <span className="hidden sm:inline">Chia sẻ</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Tùy chọn chia sẻ"
          className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg ring-1 ring-black/[0.08] z-50 py-1.5 text-sm"
        >
          <MenuItem onClick={handleCopy} icon={<CopyIcon />}>
            {copied ? "Đã sao chép!" : "Sao chép liên kết"}
          </MenuItem>
          <MenuItem onClick={handleFacebook} icon={<FacebookIcon />}>Chia sẻ qua Facebook</MenuItem>
          <MenuItem onClick={handleZalo} icon={<ZaloIcon />}>Chia sẻ qua Zalo</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, children, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-700 hover:bg-gray-50 hover:text-[#e60012] transition-colors"
    >
      <span aria-hidden className="text-gray-500">{icon}</span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M22 12.07C22 6.51 17.52 2 12 2S2 6.51 2 12.07c0 5 3.66 9.15 8.44 9.93v-7.02H7.9v-2.91h2.54V9.84c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.91h-2.33V22c4.78-.78 8.43-4.92 8.43-9.93z" />
    </svg>
  );
}
function ZaloIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.04 2 11.03c0 2.7 1.34 5.13 3.45 6.78L4.6 22l4.42-1.74c.96.23 1.96.36 2.99.36 5.52 0 10-4.04 10-9.03S17.52 2 12 2z" />
    </svg>
  );
}
