/**
 * Branded-storefront social/trust icon bar.
 *
 * Renders a clean row of icon-only buttons for the shop's verified
 * external channels — Facebook page, Zalo chat, Google Maps
 * location. Nothing here is a raw URL text dump: every channel is
 * a recognisable round icon button.
 *
 * Rules:
 *   - render NOTHING if the shop has zero verified channels (avoids
 *     a lonely orphan button row)
 *   - Facebook → seller's page if `facebook.url` is present, else
 *     skip (we don't synthesise a search URL — would feel fake)
 *   - Zalo → `https://zalo.me/<number>` only (we never render the
 *     bare phone digits — that's what the dedicated phone CTA is
 *     for)
 *   - Maps → `mapEmbedUrl` host if it's a maps.google.* URL, OR
 *     synthesised `https://www.google.com/maps?q=<address>` when
 *     the shop only has a typed address. Lat/lng beats both.
 *
 * Visual language matches the trust-badge strip: rounded pills,
 * subtle ring, light background, hover darken — no brand color
 * dump (we don't want a "MySpace 2007" look on a B2B storefront).
 *
 * Server-component-safe: pure JSX, no hooks.
 */

function buildMapsHref(shop) {
  if (!shop) return null;
  const lat = Number(shop.lat);
  const lng = Number(shop.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  const address = (shop.address || "").trim();
  const province = (shop.province || "").trim();
  const query = [address, province].filter(Boolean).join(", ");
  if (query) {
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}`;
  }
  return null;
}

function extractFacebookUrl(facebook) {
  if (!facebook) return null;
  if (typeof facebook === "string") return facebook;
  if (typeof facebook === "object" && typeof facebook.url === "string") {
    return facebook.url;
  }
  return null;
}

export default function ShopSocialButtons({ shop, className = "" }) {
  if (!shop) return null;

  const phone = (shop.phone || "").replace(/\s/g, "");
  const zalo = (shop.zalo || "").replace(/\s/g, "");
  const facebookUrl = extractFacebookUrl(shop.facebook);
  const mapsHref = buildMapsHref(shop);

  const items = [];

  if (zalo) {
    items.push({
      key: "zalo",
      href: `https://zalo.me/${zalo}`,
      label: "Nhắn Zalo",
      icon: <ChatIcon />,
      tone: "zalo",
      external: true,
    });
  }
  if (facebookUrl) {
    items.push({
      key: "facebook",
      href: facebookUrl,
      label: "Facebook page",
      icon: <FacebookIcon />,
      tone: "facebook",
      external: true,
    });
  }
  if (mapsHref) {
    items.push({
      key: "maps",
      href: mapsHref,
      label: "Mở Google Maps",
      icon: <PinIcon />,
      tone: "maps",
      external: true,
    });
  }
  if (phone) {
    items.push({
      key: "phone",
      href: `tel:${phone}`,
      label: "Gọi điện",
      icon: <PhoneIcon />,
      tone: "phone",
    });
  }

  if (items.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
      role="navigation"
      aria-label="Kênh liên hệ khác"
    >
      {items.map((it) => (
        <a
          key={it.key}
          href={it.href}
          target={it.external ? "_blank" : undefined}
          rel={it.external ? "noopener noreferrer" : undefined}
          title={it.label}
          aria-label={it.label}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full ring-1 transition-colors ${TONE_STYLES[it.tone] || TONE_STYLES.neutral}`}
        >
          {it.icon}
        </a>
      ))}
    </div>
  );
}

const TONE_STYLES = {
  zalo:     "bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100",
  facebook: "bg-[#1877F2]/10 text-[#1877F2] ring-[#1877F2]/30 hover:bg-[#1877F2]/20",
  maps:     "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100",
  phone:    "bg-red-50 text-[#e60012] ring-red-200 hover:bg-red-100",
  neutral:  "bg-gray-50 text-gray-700 ring-gray-200 hover:bg-gray-100",
};

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
