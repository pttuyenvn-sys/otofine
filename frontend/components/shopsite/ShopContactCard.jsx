"use client";

import { useState } from "react";
import ShopSection from "./ShopSection";
import ShopMapVisualBlock from "./ShopMapVisualBlock";

/**
 * Compact contact information card — phone, zalo, facebook,
 * address, working hours + map.
 *
 * Mobile compression pass:
 *   - On `<lg:` the card collapses to a "Tóm tắt liên hệ" view that
 *     shows just phone + zalo + address (the three highest-intent
 *     fields). A "Xem thêm" toggle reveals facebook + email +
 *     working hours.
 *   - The map placeholder is mounted ONLY when the user expands
 *     the section on mobile (lazy reveal — saves an aspect-ratio
 *     reserved 16:8 block from the initial paint). Desktop renders
 *     the full card as before.
 *
 * Desktop (`lg:` and up) behaves exactly as the previous version —
 * single column, every field visible, map placeholder visible by
 * default. The two regimes share the same `<ContactRow>` building
 * block so spacing/style stays consistent across breakpoints.
 *
 * The component is `"use client"` because `useState` powers the
 * expand/collapse. The SSR snapshot ships the closed-state markup
 * (just the compact rows), so server-rendered HTML is hydration-
 * stable: on first render React sees `expanded=false`, matching
 * the SSR tree exactly. Map iframe = none today; this design also
 * keeps any future iframe (Google Maps embed) deferred until the
 * user opts in on mobile.
 */
export default function ShopContactCard({ shop, variant = "compact" }) {
  if (!shop) return null;
  const dense = variant === "compact";
  const [expanded, setExpanded] = useState(false);

  const phone = (shop.phone || "").trim();
  const zalo = (shop.zalo || "").trim();
  const address = (shop.address || "").trim();
  const facebook = shop.facebook || null;
  const email = (shop.email || "").trim();
  const hours = Array.isArray(shop.workingHoursLines)
    ? shop.workingHoursLines.filter(Boolean)
    : [];

  const phoneHref = phone ? `tel:${phone.replace(/\s/g, "")}` : null;
  const zaloHref = zalo ? `https://zalo.me/${zalo.replace(/\s/g, "")}` : null;

  // The map block is opt-in on mobile (renders only when expanded)
  // but stays always-on for desktop. `showMap` encodes that rule
  // without per-call media-query JS — desktop simply ignores the
  // `expanded` gate via the `lg:!block` override.
  const mapHasAnyData =
    Boolean(shop.mapEmbedUrl) ||
    (typeof shop.lat === "number" && Number.isFinite(shop.lat)) ||
    Boolean((shop.address || "").trim());

  return (
    <ShopSection title="Thông tin liên hệ" className="h-full">
      <ul
        className={`space-y-${dense ? 2 : 3} text-sm text-gray-800`}
        aria-label="Liên hệ chính"
      >
        {phone && (
          <ContactRow icon={<PhoneIcon />} label="Điện thoại">
            {phoneHref ? (
              <a href={phoneHref} className="hover:text-[#e60012]">
                {phone}
              </a>
            ) : (
              <span>{phone}</span>
            )}
          </ContactRow>
        )}
        {zalo && (
          <ContactRow icon={<ChatIcon />} label="Zalo">
            {zaloHref ? (
              <a
                href={zaloHref}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#e60012]"
              >
                Zalo: {zalo}
              </a>
            ) : (
              <span>Zalo: {zalo}</span>
            )}
          </ContactRow>
        )}
        {address && (
          <ContactRow icon={<PinIcon />} label="Địa chỉ">
            <span>{address}</span>
          </ContactRow>
        )}

        {/*
          Secondary contact rows — hidden on mobile until the user
          taps "Xem thêm". `lg:!block` forces them visible on desktop
          regardless of the `expanded` state, so desktop reads as one
          continuous card with no toggle.
        */}
        <div
          className={`${expanded ? "block" : "hidden"} lg:!block space-y-${dense ? 2 : 3}`}
        >
          {facebook && (
            <ContactRow icon={<FacebookIcon />} label="Facebook">
              <a
                href={facebook.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#e60012]"
              >
                {facebook.label || "Facebook"}
              </a>
            </ContactRow>
          )}
          {email && (
            <ContactRow icon={<MailIcon />} label="Email">
              <a href={`mailto:${email}`} className="hover:text-[#e60012]">
                {email}
              </a>
            </ContactRow>
          )}
          {hours.length > 0 && (
            <ContactRow icon={<ClockIcon />} label="Giờ làm việc">
              <div className="space-y-0.5">
                {hours.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </ContactRow>
          )}
        </div>
      </ul>

      {/*
        Map visual block — reinforces "địa chỉ thật / hoạt động thật"
        with a real Google Maps embed instead of a grid placeholder.
        The shared `<ShopMapVisualBlock>` handles lazy mount, embed-url
        priority, and the empty-state fallback.

        Desktop renders unconditionally; mobile renders only after
        expand (same `expanded ? "block" : "hidden"` + `lg:!block`
        pattern as before — no first-paint layout reservation for
        collapsed mobile cards).
      */}
      {mapHasAnyData && (
        <div className={`${expanded ? "block" : "hidden"} lg:!block mt-3`}>
          <ShopMapVisualBlock
            shopName={shop.name || ""}
            address={shop.address || ""}
            province={shop.province || ""}
            lat={typeof shop.lat === "number" ? shop.lat : null}
            lng={typeof shop.lng === "number" ? shop.lng : null}
            mapEmbedUrl={shop.mapEmbedUrl || null}
          />
        </div>
      )}

      {/* Mobile-only expand/collapse toggle. Hidden on desktop. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="lg:hidden mt-3 w-full inline-flex items-center justify-center gap-1 text-xs font-medium text-[#e60012] hover:underline py-1.5"
        aria-expanded={expanded}
        aria-label={expanded ? "Thu gọn" : "Xem thêm thông tin liên hệ"}
      >
        {expanded ? "Thu gọn" : "Xem thêm"}
        <ChevronIcon flipped={expanded} />
      </button>
    </ShopSection>
  );
}

function ContactRow({ icon, label, children }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-50 text-[#e60012] shrink-0"
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="sr-only">{label}</div>
        <div className="text-sm text-gray-800 break-words">{children}</div>
      </div>
    </li>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M22 12.07C22 6.51 17.52 2 12 2S2 6.51 2 12.07c0 5 3.66 9.15 8.44 9.93v-7.02H7.9v-2.91h2.54V9.84c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.91h-2.33V22c4.78-.78 8.43-4.92 8.43-9.93z" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function ChevronIcon({ flipped }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`transition-transform ${flipped ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
