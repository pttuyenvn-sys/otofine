"use client";

import { ShopsiteEvents, trackShopsiteEvent } from "@/lib/shopsite/shopsiteAnalytics";

/**
 * Mobile-only fixed bottom CTA bar.
 *
 * Conventions:
 *   - hidden on `sm:` breakpoint and above (sticky desktop CTA lives in
 *     the contact card column on the home page)
 *   - safe-area aware via `env(safe-area-inset-bottom)` so iOS notches
 *     don't clip the tap target
 *   - shadow + blurred background so the bar reads above any page
 *     content but doesn't fully obscure the last row of products
 *   - each button fires an analytics event AND honours the `href`
 *     (`tel:`, `https://zalo.me/...`, facebook URL) — never blocks
 *     the navigation
 *
 * SSR-safe: pure markup, no `useState` / `useEffect`. The CustomEvent
 * dispatch is wrapped server-side via `trackShopsiteEvent` which
 * no-ops when `window` is undefined.
 */
export default function ShopFloatingMobileCTA({ shop }) {
  if (!shop) return null;
  const phone = (shop.phone || "").replace(/\s/g, "");
  const zalo = (shop.zalo || phone || "").replace(/\s/g, "");
  const fb = shop.facebook?.url || null;
  const slug = shop.slug || null;
  const meta = { shopSlug: slug };

  // Hide entirely if there's no contact data at all — avoids a
  // dead-looking empty bar on shops that have just signed up.
  if (!phone && !zalo && !fb) return null;

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
        {fb && (
          <CTAButton
            href={fb}
            tone="neutral"
            label="Facebook"
            onClick={() => trackShopsiteEvent(ShopsiteEvents.FACEBOOK_CLICK, meta)}
            icon={<FacebookIcon />}
            external
          />
        )}
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
function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M22 12.07C22 6.51 17.52 2 12 2S2 6.51 2 12.07c0 5 3.66 9.15 8.44 9.93v-7.02H7.9v-2.91h2.54V9.84c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.91h-2.33V22c4.78-.78 8.43-4.92 8.43-9.93z" />
    </svg>
  );
}
