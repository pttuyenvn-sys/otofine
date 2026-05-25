"use client";

import { ShopsiteEvents, trackShopsiteEvent } from "@/lib/shopsite/shopsiteAnalytics";

/**
 * Mobile-only fixed bottom CTA bar.
 *
 * Slots (left → right):
 *   1. Gọi ngay        — `tel:<phone>`, brand red, primary action
 *   2. Nhắn Zalo       — `https://zalo.me/<id>`, neutral
 *   3. Tìm phụ tùng    — `/rfq/new`, neutral — the universal RFQ
 *      entry point so a buyer who didn't find what they need can
 *      pivot to "ask any shop" with one tap
 *
 * Conventions:
 *   - hidden on `sm:` breakpoint and above (sticky desktop CTA lives in
 *     the contact card column on the home page)
 *   - safe-area aware via `env(safe-area-inset-bottom)` so iOS notches
 *     don't clip the tap target
 *   - shadow + blurred background so the bar reads above any page
 *     content but doesn't fully obscure the last row of products
 *   - each button fires an analytics event AND honours the `href`
 *     (`tel:`, `https://zalo.me/...`, `/rfq/new`) — never blocks
 *     the navigation
 *
 * SSR-safe: pure markup, no `useState` / `useEffect`. The CustomEvent
 * dispatch is wrapped server-side via `trackShopsiteEvent` which
 * no-ops when `window` is undefined.
 *
 * Mobile-compression role: this bar is also the reason the hero
 * CTAs got dropped on phones — every shop visitor still has a
 * sticky, always-reachable "call / zalo / RFQ" surface regardless
 * of scroll position, so removing the hero's phone+zalo buttons
 * on `<sm` is a net UX win (recovers ~50px of above-fold real
 * estate without losing reachability).
 */
export default function ShopFloatingMobileCTA({ shop }) {
  if (!shop) return null;
  const phone = (shop.phone || "").replace(/\s/g, "");
  const zalo = (shop.zalo || phone || "").replace(/\s/g, "");
  const slug = shop.slug || null;
  const meta = { shopSlug: slug };

  // RFQ entry point uses the absolute apex URL (`apexUrl` would be
  // overkill here since we're already on the apex shopsite host or
  // a wildcard subdomain that rewrites apex-relative). A bare
  // `/rfq/new` works in both cases because the buyer-facing RFQ
  // route is host-stable across apex + subdomain.
  const rfqHref = "/rfq/new";

  // Hide entirely if there's no contact data at all — avoids a
  // dead-looking empty bar on shops that have just signed up. The
  // "Tìm phụ tùng" button alone isn't enough to justify the bar
  // since the apex home already exposes that flow.
  if (!phone && !zalo) return null;

  return (
    <div
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 px-3"
      style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      role="region"
      aria-label="Liên hệ shop nhanh"
    >
      <div className="mx-auto max-w-screen-sm bg-white/95 supports-[backdrop-filter]:bg-white/85 supports-[backdrop-filter]:backdrop-blur shadow-[0_-6px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04] rounded-2xl px-2 py-2 flex items-stretch gap-2">
        {phone && (
          <CTAButton
            href={`tel:${phone}`}
            tone="primary"
            label="Gọi ngay"
            onClick={() => trackShopsiteEvent(ShopsiteEvents.PHONE_CLICK, meta)}
            icon={<PhoneIcon />}
          />
        )}
        {zalo && (
          <CTAButton
            href={`https://zalo.me/${zalo}`}
            tone="neutral"
            label="Zalo"
            onClick={() => trackShopsiteEvent(ShopsiteEvents.ZALO_CLICK, meta)}
            icon={<ChatIcon />}
            external
          />
        )}
        <CTAButton
          href={rfqHref}
          tone="neutral"
          label="Tìm phụ tùng"
          onClick={() =>
            trackShopsiteEvent(ShopsiteEvents.RFQ_CTA_CLICK || "rfq_cta_click", meta)
          }
          icon={<SearchIcon />}
        />
      </div>
    </div>
  );
}

function CTAButton({ href, tone, label, onClick, icon, external }) {
  const base =
    "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold py-2.5 transition-all active:scale-[0.97] min-h-[44px]";
  const palette =
    tone === "primary"
      ? "bg-[#e60012] text-white hover:bg-[#c1000f] shadow"
      : "bg-gray-100 text-gray-800 hover:bg-gray-200";
  return (
    <a
      href={href}
      onClick={onClick}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`${base} ${palette}`}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </a>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
