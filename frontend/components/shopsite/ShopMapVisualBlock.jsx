"use client";

/**
 * Shared "Bản đồ" visual block — used by both the storefront homepage
 * contact card and the dedicated `/lien-he` page.
 *
 * Rendering priority for the iframe `src`:
 *   1. Seller-provided `mapEmbedUrl` IF it looks like an embed-able
 *      Google Maps URL (contains `/maps/embed` or `output=embed`).
 *      This lets the seller paste their own "Embed a map" iframe
 *      <src> and keep the exact pin / zoom / region they configured.
 *   2. `lat,lng` if both are finite numbers — anchors the pin
 *      precisely without rounding to whatever the geocoder picks for
 *      the address string.
 *   3. Free-text address (`address || "<name>, <province>"`) routed
 *      through Google's `maps?q=...&output=embed` query — works
 *      without an API key and falls back gracefully for sellers that
 *      only typed an address line.
 *
 * Performance:
 *   - The iframe is mounted lazily via IntersectionObserver
 *     (rootMargin 200px) so the browser doesn't request maps tiles
 *     until the block is about to enter the viewport. Cheap even on
 *     mobile cold loads.
 *   - A subtle SVG-grid background covers the aspect-ratio reservation
 *     before the iframe hydrates, eliminating the "blank placeholder"
 *     flash and preventing CLS.
 *
 * Trust UX overlays:
 *   - Top-left marker-pin badge with the shop's business name (anchors
 *     "this is a real shop").
 *   - Bottom-center floating "Mở Google Maps" CTA that opens
 *     `https://www.google.com/maps?q=<query>` in a new tab — preserves
 *     the existing app-open behaviour for both mobile (Maps app) and
 *     desktop (web).
 *   - Optional footer strip with address + district / city.
 *
 * Empty state:
 *   - If the shop has no `mapEmbedUrl`, no coordinates and no address,
 *     `renderEmpty=true` produces a compact card explaining that the
 *     seller hasn't configured the map yet — never a broken grey
 *     placeholder.
 *
 * Storefront SEO is preserved: this is a client island, mounted only
 * after hydration. Server-rendered HTML still contains the address
 * text + "Mở Google Maps" link in the SSR tree for crawlers (rendered
 * by parents via the visual block's `directionsHref`-driven CTA, but
 * the SSR fallback markup is structurally identical to the post-
 * hydration markup since the iframe slot just shows the SVG grid).
 */

import { useEffect, useRef, useState } from "react";

/**
 * Heuristic — is `url` a Google Maps URL we can drop directly into an
 * `<iframe src>`? We accept two flavours:
 *
 *   1. Real "Embed a map" iframe URLs that look like
 *      `https://www.google.com/maps/embed?pb=…`. Google rejects
 *      requests where the `pb` payload is missing or truncated
 *      ("Invalid 'pb' parameter"), which yields a hard error inside
 *      the iframe instead of a map. We've seen sellers paste partial
 *      `pb` values (testing copy-paste, etc.), so require a minimum
 *      length to weed those out.
 *
 *   2. `https://…/maps?q=…&output=embed` style URLs — those don't use
 *      `pb` at all and are safe to forward straight through.
 *
 * If we reject the URL the caller falls through to the lat/lng path,
 * and then to the address fallback. The seller's original URL is
 * still used as the directions-CTA target (preserves the exact pin
 * they configured in their Maps profile).
 */
function isEmbedableMapUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  const looksLikeEmbedPath = lower.includes("/maps/embed");
  const looksLikeQueryEmbed = lower.includes("output=embed");
  if (!looksLikeEmbedPath && !looksLikeQueryEmbed) return false;

  if (looksLikeEmbedPath) {
    // The real `pb` payload always carries the place ID (`!Ns0x…`)
    // plus zoom + locale segments, and runs well over 200 characters
    // in practice. Anything shorter is almost certainly a truncated
    // paste — Google will reject it at render time. Length cap of
    // 80 is the safest "definitely broken" threshold without false
    // positives on legitimate compact embeds.
    const pbMatch = trimmed.match(/[?&]pb=([^&#]+)/i);
    if (!pbMatch) return false;
    const pb = pbMatch[1];
    if (!pb || pb.length < 80) return false;
  }
  return true;
}

function buildIframeSrc({ mapEmbedUrl, lat, lng, query }) {
  if (mapEmbedUrl && isEmbedableMapUrl(mapEmbedUrl)) {
    return mapEmbedUrl;
  }
  // `z=15` shows ~district-level context (roads, landmarks, the
  // neighbourhood pattern) while still being tight enough that the
  // pin reads as a precise location. `z=16` was too zoomed-in for
  // mis-geocoded or partial Vietnamese addresses (the iframe rendered
  // as nearly-empty green when the geocoder landed in a park / field
  // adjacent to the actual street).
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps?q=${lat},${lng}&z=16&hl=vi&output=embed`;
  }
  if (query && query.trim()) {
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=15&hl=vi&output=embed`;
  }
  return null;
}

function buildDirectionsHref({ mapEmbedUrl, lat, lng, query }) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  if (query && query.trim()) {
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}`;
  }
  // Seller pasted a non-embed Google Maps URL (e.g. a shortened share
  // link). The iframe path won't render it, but the CTA can still open
  // the seller's exact pin in a new tab.
  if (mapEmbedUrl && !isEmbedableMapUrl(mapEmbedUrl)) return mapEmbedUrl;
  return null;
}

function PinIcon({ size = 14 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export default function ShopMapVisualBlock({
  shopName,
  address,
  province,
  lat,
  lng,
  mapEmbedUrl,
  className = "",
  aspectClassName = "aspect-[16/9]",
  testId = "shop-contact-map",
}) {
  const ref = useRef(null);
  const [shouldMount, setShouldMount] = useState(false);

  const cleanName = (shopName || "").trim();
  const cleanAddress = (address || "").trim();
  const cleanProvince = (province || "").trim();
  const finiteLat = typeof lat === "number" && Number.isFinite(lat) ? lat : null;
  const finiteLng = typeof lng === "number" && Number.isFinite(lng) ? lng : null;

  // Build a free-text fallback query — used both as the iframe `q=`
  // and as the directions-CTA target when no coords are on file.
  //
  // Strategy: prefer a clean address-first query so Google's geocoder
  // resolves to the actual street location. Mixing the shop name in
  // can confuse the geocoder into matching unrelated POIs (especially
  // for generic names like "Phụ tùng ô tô 355" which Google can
  // match to other businesses with the same number). The shop name
  // only enters the query when there's NO address — then it acts as
  // the POI search term.
  const fallbackQuery = (() => {
    if (cleanAddress) {
      const parts = [cleanAddress];
      if (
        cleanProvince &&
        !cleanAddress.toLowerCase().includes(cleanProvince.toLowerCase())
      ) {
        parts.push(cleanProvince);
      }
      return parts.join(", ").trim();
    }
    // No address — fall back to name + province.
    const parts = [];
    if (cleanName) parts.push(cleanName);
    if (cleanProvince) parts.push(cleanProvince);
    return parts.join(", ").trim();
  })();

  const iframeSrc = buildIframeSrc({
    mapEmbedUrl: mapEmbedUrl || null,
    lat: finiteLat,
    lng: finiteLng,
    query: fallbackQuery,
  });
  const directionsHref = buildDirectionsHref({
    mapEmbedUrl: mapEmbedUrl || null,
    lat: finiteLat,
    lng: finiteLng,
    query: fallbackQuery,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShouldMount(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldMount(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Compact empty state — seller hasn't configured the map.
  if (!iframeSrc && !directionsHref) {
    return (
      <div
        ref={ref}
        data-testid={testId}
        className={
          "rounded-2xl border border-dashed border-gray-200 bg-gradient-to-br from-gray-50 via-white to-gray-50 p-5 sm:p-6 flex items-center gap-3 " +
          className
        }
      >
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-400 shrink-0"
        >
          <PinIcon size={18} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-700">
            Shop chưa cập nhật bản đồ
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">
            Khi shop bổ sung địa chỉ hoặc tọa độ, bản đồ sẽ tự động hiển thị
            ở đây.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-testid={testId}
      className={
        "relative rounded-2xl overflow-hidden border border-gray-200 bg-gradient-to-br from-gray-100 via-gray-50 to-white shadow-sm " +
        className
      }
    >
      <div className={"relative " + aspectClassName}>
        {/* SSR fallback / pre-hydration filler — keeps the slot from
            looking like a broken grey rectangle if the IntersectionObserver
            hasn't triggered the iframe yet. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><rect width=%22120%22 height=%22120%22 fill=%22%23f3f4f6%22/><path d=%22M0 60 L120 60 M60 0 L60 120%22 stroke=%22%23e5e7eb%22 stroke-width=%221%22/></svg>')] opacity-60"
        />

        {shouldMount && iframeSrc ? (
          <iframe
            title={cleanName ? `Vị trí ${cleanName}` : "Vị trí cửa hàng"}
            src={iframeSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 w-full h-full border-0 grayscale-[0.04]"
            allowFullScreen
          />
        ) : null}

        {/* Marker-pin badge — anchors "this is a real shop" even before
            the iframe finishes loading. */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-1.5 shadow ring-1 ring-black/5 max-w-[80%]">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#e60012] text-white shrink-0">
            <PinIcon />
          </span>
          <span className="text-[11px] font-semibold text-gray-800 truncate">
            {cleanName || "Cửa hàng"}
          </span>
        </div>

        {/* Centered floating CTA — the iframe captures pointer events
            for pan/zoom, so we wrap the CTA in a pointer-events-none
            layer and re-enable on the link itself. */}
        {directionsHref && (
          <div className="absolute inset-x-0 bottom-2.5 flex items-center justify-center pointer-events-none">
            <a
              href={directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto inline-flex items-center gap-1.5 bg-[#e60012] hover:bg-[#c1000f] text-white text-[12px] font-semibold px-3.5 py-2 rounded-full shadow-lg ring-1 ring-black/5 transition-colors"
            >
              <PinIcon />
              Mở Google Maps
            </a>
          </div>
        )}
      </div>

      {/* Footer strip — reinforces "địa chỉ thật / hoạt động thật"
          without crowding the iframe itself. */}
      {(cleanAddress || cleanProvince) && (
        <div className="px-3 py-2 bg-white border-t border-gray-100 flex items-center gap-2">
          <span aria-hidden className="text-[#e60012] shrink-0">
            <PinIcon />
          </span>
          <p className="text-[12px] text-gray-700 leading-snug min-w-0">
            <span className="line-clamp-2">
              {cleanAddress || cleanProvince}
            </span>
            {cleanProvince && cleanAddress && (
              <span className="text-gray-500"> · {cleanProvince}</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
