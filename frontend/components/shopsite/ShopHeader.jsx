import ShopTrustBadges from "./ShopTrustBadges";
import ShopShareMenu from "./ShopShareMenu";
import ShopImage from "./ShopImage";

/**
 * Top of the shop public site:
 *  A. utility topbar (phone, hours, follow, share, search)
 *  B. cover with avatar + name + meta + CTA buttons
 *  C. trust-badge strip (Phase 5.1) — compact chips below the cover
 *
 * Tabs live in a separate <ShopTabs> below this header so the layout
 * can keep them sticky-ready without re-rendering the cover.
 *
 * Conversion polish (Phase 5.1):
 *   - <ShopShareMenu /> replaces the topbar "Chia sẻ" placeholder
 *     (Web Share API on mobile, dropdown elsewhere)
 *   - trust-badge strip rendered under the cover
 *
 * Stays a server component — analytics tracking for the primary CTA
 * happens in the client islands (<ShopFloatingMobileCTA />, sticky
 * contact card) so this component stays in the static SSR tree.
 */
export default function ShopHeader({ shop, badges }) {
  if (!shop) return null;
  const initials = (shop.name || "")
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  // Defensive coercion — Phase 5.7 hardening. Real shop rows
  // sometimes have NULL phone / zalo / shortDescription (newly
  // signed-up sellers). Strip them once at the top so every leaf
  // can render `tel:${phone}` without a null guard.
  const safePhone = (shop.phone || "").replace(/\s/g, "");
  const safeZalo = (shop.zalo || safePhone || "").replace(/\s/g, "");
  const safeShort = shop.shortDescription || "";

  return (
    <div className="space-y-2 sm:space-y-3">
      {/*
        A. Utility topbar — Mobile compression pass:
           - hidden on <sm so the hero is the first paint on phones
             (the phone + working hours are surfaced via the floating
             mobile CTA + sticky contact card)
           - on sm+ stays the original compact bar
      */}
      <div className="hidden sm:flex bg-white rounded-2xl shadow-sm px-3 sm:px-5 py-2 items-center justify-between gap-4 text-xs sm:text-sm">
        <div className="flex items-center gap-4 sm:gap-6 min-w-0 overflow-x-auto">
          {safePhone && (
            <span className="inline-flex items-center gap-2 text-gray-700 whitespace-nowrap">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50 text-[#e60012]">
                <PhoneIcon />
              </span>
              <span className="font-medium">{shop.phone}</span>
            </span>
          )}
          {shop.workingHoursShort && (
            <span className="inline-flex items-center gap-2 text-gray-700 whitespace-nowrap">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50 text-[#e60012]">
                <ClockIcon />
              </span>
              {shop.workingHoursShort}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 sm:gap-5 text-gray-600 shrink-0">
          <UtilButton icon={<HeartIcon />} label="Theo dõi shop">Theo dõi shop</UtilButton>
          <ShopShareMenu shopName={shop.name} shopSlug={shop.slug} />
          <UtilButton icon={<SearchIcon />} label="Tìm kiếm">Tìm kiếm</UtilButton>
        </div>
      </div>

      {/* B. Cover section — Phase 5.7: ShopImage so a broken /
          missing R2 URL doesn't render a Chrome broken-icon hole;
          the cover is the LCP, so `priority` flips
          loading="eager" + fetchpriority="high".

          Mobile compression: the hero on phones used to consume
          ~225px of viewport (16:7 of a 390px-wide column). Halved
          to 16:11 on mobile (~245px → ~155px after avatar/CTA
          row fits inside it) so the user reaches actionable
          content above the fold. Desktop stays at the wider
          cinematic 16:5 ratio. */}
      <div className="relative rounded-2xl overflow-hidden shadow-sm">
        <div className="relative aspect-[16/11] sm:aspect-[16/5] bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700">
          {shop.cover ? (
            <ShopImage
              src={shop.cover}
              alt={`Ảnh bìa ${shop.name}`}
              className="absolute inset-0 w-full h-full object-cover"
              fallbackClassName="absolute inset-0 w-full h-full"
              fallback={null}
              priority
            />
          ) : null}
          {/* Phase 4 polish: deeper bottom gradient + radial fade at the
              bottom-left so the avatar+name area always stays readable
              regardless of cover content; subtle top vignette keeps the
              topbar legibility on bright covers. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,0,0,0.55),transparent_55%)]"
          />

          {/* Info overlay
              Mobile compression: avatar 56px (vs the old 80px) and
              flex-row at every breakpoint so the avatar+name row
              compacts into a single line — saves another ~70px of
              vertical real estate before the CTA buttons. */}
          <div className="absolute inset-0 px-3 sm:px-6 lg:px-8 flex items-end pb-3 sm:pb-6">
            <div className="flex flex-row items-end sm:items-end gap-3 sm:gap-5 w-full">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-14 h-14 sm:w-28 sm:h-28 rounded-full bg-black/80 ring-2 ring-white/10 border-2 sm:border-[3px] border-white shadow-xl flex items-center justify-center text-white overflow-hidden">
                  {shop.avatar ? (
                    <ShopImage
                      src={shop.avatar}
                      alt={`Logo ${shop.name}`}
                      className="w-full h-full rounded-full object-cover"
                      fallbackClassName="w-full h-full rounded-full bg-black/80"
                      fallback={
                        <div className="text-center leading-tight">
                          <div className="text-base sm:text-2xl font-extrabold tracking-wide text-[#ff4d4d]">
                            {initials || "355"}
                          </div>
                          <div className="text-[8px] sm:text-[10px] font-semibold text-white/80 tracking-widest">
                            AUTO PARTS
                          </div>
                        </div>
                      }
                    />
                  ) : (
                    <div className="text-center leading-tight">
                      <div className="text-base sm:text-2xl font-extrabold tracking-wide text-[#ff4d4d]">
                        {initials || "355"}
                      </div>
                      <div className="text-[8px] sm:text-[10px] font-semibold text-white/80 tracking-widest">
                        AUTO PARTS
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Name + meta
                  Mobile compression: drop the meta line (province /
                  rating / customer count) on <sm — those signals
                  are still surfaced via the trust badges strip
                  rendered just below the cover. Keep name + verified
                  badge + short description as the only mobile hero
                  text. Desktop renders everything as before. */}
              <div className="flex-1 min-w-0 text-white">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-2xl lg:text-3xl font-bold drop-shadow-md leading-tight line-clamp-2">
                    {shop.name}
                  </h1>
                  {shop.verified && (
                    <span
                      aria-label="Đã xác minh"
                      title="Shop đã được Otofine xác minh"
                      className="inline-flex items-center gap-1 pl-1 pr-1.5 sm:pl-1.5 sm:pr-2 py-0.5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white text-[9px] sm:text-[11px] font-semibold shadow ring-1 ring-white/30"
                    >
                      <span className="inline-flex items-center justify-center w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-white/15">
                        <CheckIcon />
                      </span>
                      <span className="hidden xs:inline sm:inline">Đã xác minh</span>
                      <span className="xs:hidden sm:hidden">Verified</span>
                    </span>
                  )}
                </div>
                {safeShort && (
                  <p className="hidden sm:block text-xs sm:text-sm text-white/85 mt-1 line-clamp-2">
                    {safeShort}
                  </p>
                )}

                <div className="hidden sm:flex mt-2 items-center flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-white/90">
                  {shop.province && (
                    <span className="inline-flex items-center gap-1">
                      <PinIcon /> {shop.province}
                    </span>
                  )}
                  {shop.rating != null && (
                    <span className="inline-flex items-center gap-1">
                      <StarIcon /> {shop.rating}{" "}
                      <span className="text-white/70">
                        ({shop.ratingCount ?? 0} đánh giá)
                      </span>
                    </span>
                  )}
                  {shop.customerCount != null && (
                    <span className="inline-flex items-center gap-1">
                      <UsersIcon /> {shop.customerCount} khách hàng
                    </span>
                  )}
                </div>
              </div>

              {/* CTAs — Phase 4 polish + mobile compression. On
                  mobile the CTAs are HIDDEN inside the hero because
                  they're already provided by the floating bottom CTA
                  bar (call / zalo / RFQ). Desktop keeps them in the
                  hero so users on wide screens have an immediate
                  click target without scrolling. */}
              {(safePhone || safeZalo) && (
                <div className="hidden sm:flex items-center gap-2 sm:gap-3 shrink-0 sm:w-auto">
                  {safeZalo && (
                    <a
                      href={`https://zalo.me/${safeZalo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 bg-white text-gray-800 hover:bg-gray-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium shadow transition-all"
                    >
                      <ChatIcon /> Nhắn tin
                    </a>
                  )}
                  {safePhone && (
                    <a
                      href={`tel:${safePhone}`}
                      className="inline-flex items-center justify-center gap-2 bg-[#e60012] hover:bg-[#c1000f] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium shadow-md transition-all"
                    >
                      <PhoneIcon /> Gọi ngay
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* C. Mobile-only quick-search + short description.
          The hero on mobile is intentionally minimal (name +
          verified badge + cover). The search box that used to live
          in the utility topbar is surfaced here so phone users
          still get a one-tap entry into the products page. */}
      <div className="sm:hidden bg-white rounded-2xl shadow-sm px-3 py-2.5 space-y-2">
        {safeShort && (
          <p className="text-xs text-gray-600 leading-snug line-clamp-2">
            {safeShort}
          </p>
        )}
        <form
          action={`/shops/${shop.slug}/san-pham`}
          method="get"
          className="flex items-center bg-gray-50 rounded-xl px-2.5 py-1.5 ring-1 ring-gray-200 focus-within:ring-[#e60012]/40 focus-within:bg-white"
          role="search"
        >
          <span aria-hidden className="text-gray-400 shrink-0 mr-1.5">
            <SearchIcon />
          </span>
          <input
            type="text"
            name="q"
            placeholder="Tìm trong shop…"
            aria-label="Tìm sản phẩm trong shop"
            className="flex-1 min-w-0 bg-transparent text-sm placeholder-gray-400 outline-none"
          />
        </form>
      </div>

      {/* D. Trust badges (Phase 5.1) — graceful no-op when empty. */}
      {Array.isArray(badges) && badges.length > 0 && (
        <ShopTrustBadges badges={badges} className="px-1" />
      )}
    </div>
  );
}

function UtilButton({ icon, label, children }) {
  // `label` mirrors the visible text and stays attached as `aria-label`
  // so screen readers — and Lighthouse `button-name` — can name the
  // control even when the visible label is hidden at the `sm:` breakpoint.
  return (
    <button
      type="button"
      aria-label={label || (typeof children === "string" ? children : undefined)}
      className="inline-flex items-center gap-1.5 hover:text-[#e60012] whitespace-nowrap"
    >
      <span aria-hidden>{icon}</span>
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
