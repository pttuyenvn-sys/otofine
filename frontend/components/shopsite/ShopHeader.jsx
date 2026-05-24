/**
 * Top of the shop public site:
 *  A. utility topbar (phone, hours, follow, share, search)
 *  B. cover with avatar + name + meta + CTA buttons
 *
 * Tabs live in a separate <ShopTabs> below this header so the layout
 * can keep them sticky-ready without re-rendering the cover.
 */
export default function ShopHeader({ shop }) {
  if (!shop) return null;
  const initials = (shop.name || "")
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-3">
      {/* A. Utility topbar */}
      <div className="bg-white rounded-2xl shadow-sm px-3 sm:px-5 py-2 flex items-center justify-between gap-4 text-xs sm:text-sm">
        <div className="flex items-center gap-4 sm:gap-6 min-w-0 overflow-x-auto">
          <span className="inline-flex items-center gap-2 text-gray-700 whitespace-nowrap">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50 text-[#e60012]">
              <PhoneIcon />
            </span>
            <span className="font-medium">{shop.phone}</span>
          </span>
          <span className="inline-flex items-center gap-2 text-gray-700 whitespace-nowrap">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50 text-[#e60012]">
              <ClockIcon />
            </span>
            {shop.workingHoursShort}
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-5 text-gray-600 shrink-0">
          <UtilButton icon={<HeartIcon />}>Theo dõi shop</UtilButton>
          <UtilButton icon={<ShareIcon />}>Chia sẻ</UtilButton>
          <UtilButton icon={<SearchIcon />}>Tìm kiếm</UtilButton>
        </div>
      </div>

      {/* B. Cover section */}
      <div className="relative rounded-2xl overflow-hidden shadow-sm">
        <div className="relative aspect-[16/7] sm:aspect-[16/5] bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700">
          {shop.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shop.cover}
              alt={`Ảnh bìa ${shop.name}`}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
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

          {/* Info overlay */}
          <div className="absolute inset-0 px-4 sm:px-6 lg:px-8 flex items-end pb-4 sm:pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5 w-full">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-black/80 ring-2 ring-white/10 border-2 sm:border-[3px] border-white shadow-xl flex items-center justify-center text-white">
                  {shop.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shop.avatar}
                      alt={`Logo ${shop.name}`}
                      className="w-full h-full rounded-full object-cover"
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

              {/* Name + meta */}
              <div className="flex-1 min-w-0 text-white">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold drop-shadow-md">
                    {shop.name}
                  </h1>
                  {shop.verified && (
                    <span
                      aria-label="Đã xác minh"
                      title="Shop đã được Otofine xác minh"
                      className="inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white text-[10px] sm:text-[11px] font-semibold shadow ring-1 ring-white/30"
                    >
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white/15">
                        <CheckIcon />
                      </span>
                      Đã xác minh
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-white/85 mt-1 line-clamp-2">
                  {shop.shortDescription}
                </p>

                <div className="mt-2 flex items-center flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-white/90">
                  <span className="inline-flex items-center gap-1">
                    <PinIcon /> {shop.province}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <StarIcon /> {shop.rating}{" "}
                    <span className="text-white/70">
                      ({shop.ratingCount} đánh giá)
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UsersIcon /> {shop.customerCount} khách hàng
                  </span>
                </div>
              </div>

              {/* CTAs — Phase 4 polish: stronger hover, focus ring,
                  scale microtransition, mobile takes full-row spacing. */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0 w-full sm:w-auto">
                <a
                  href={`https://zalo.me/${shop.zalo.replace(/\s/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-white text-gray-800 hover:bg-gray-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium shadow transition-all"
                >
                  <ChatIcon /> Nhắn tin
                </a>
                <a
                  href={`tel:${shop.phone.replace(/\s/g, "")}`}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-[#e60012] hover:bg-[#c1000f] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium shadow-md transition-all"
                >
                  <PhoneIcon /> Gọi ngay
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UtilButton({ icon, children }) {
  return (
    <button
      type="button"
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
