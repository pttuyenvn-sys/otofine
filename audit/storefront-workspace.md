# Storefront ↔ Seller Workspace Connectivity — Audit

Phase: **`feat(storefront-workspace): connect storefront and seller workflow UX`**

## Goal

Connect the public storefront and the seller workspace into one
seamless commerce workflow. Additive only — preserve all APIs,
routes, business logic, storefront SEO, wildcard routing, and
auth flow.

## What was already in place (prior phase)

* `StorefrontSellerShortcut` — owner-only floating chip in
  bottom-right of the storefront, with dropdown of 5 IA items
  (Shop / Sản phẩm / Khách hàng / Hiệu quả / Tài khoản).
* Sidebar + mobile bottom nav unified around the same 5 items.
* `/shop/insights` page with `ShopMetricsOverview` cards (30-day
  + "Hôm nay" rows).
* `ShopMapVisualBlock` upgrade across all storefront pages
  (homepage, gioi-thieu, lien-he).
* Storefront-level "Xem storefront" CTA in `/shop/settings`
  header.

## What's new in this phase

### 1. Cross-subdomain owner detection (the real gap)

The chip from the prior phase only worked on `otofine.com/shops/<slug>`
because `localStorage` is per-origin. The user explicitly asked for
`<slug>.otofine.com` to also show the admin switcher.

* **`frontend/lib/auth/sellerOwnerCookie.js`** — write / read / clear
  helpers for a new `ot_owner` cookie scoped to `Domain=.otofine.com`,
  `SameSite=Lax + Secure` in production. The cookie value is the JWT
  (same shape as the existing localStorage token). No-op on
  localhost / IPs / non-otofine hosts so dev environments aren't
  affected.
* Wired into:
  * `ShopLogin.jsx` — writes the cookie after successful
    `/auth/shop-login`.
  * `Topbar.jsx` and `ShopAccount.jsx` — clear the cookie on
    every logout path.
* **Security note**: backend uses `Authorization: Bearer …`. It
  never reads cookies for auth, so adding this cookie has zero
  CSRF surface and zero auth-flow regression. Same XSS risk
  profile as the existing localStorage token (no incremental risk).

### 2. Shared owner-state hook

* **`frontend/hooks/useStorefrontOwnerState.js`** — single source of
  truth that returns `{ isOwner, token, email, shopId, role, ready }`.
  Token lookup order: `localStorage.token` → `document.cookie`. Both
  the chip and the new top strip consume this hook so there's no
  duplicate detection logic.

### 3. `StorefrontOwnerStrip` (NEW)

* **`frontend/components/shopsite/StorefrontOwnerStrip.jsx`** — a slim
  top sticky bar that ONLY renders for the verified owner. Layout:
  `[SELLER badge · "Đây là shop của bạn" + email]   [today metrics pills]   [Quản lý shop ↗] [✕]`.
* Fetches `/shop/metrics/overview` once on mount when ownership is
  confirmed — anonymous visitors never trigger the call.
* Dismissible per session (sessionStorage keyed by shopId).
* Mobile-compact: title text + email collapse, CTA shrinks to icon
  only, metrics scroll horizontally.
* Mounted at the top of `app/(shopsite)/shops/[slug]/layout.js`.
* Targets the apex (`otofine.com/shop/*`) when the strip is rendered
  on a wildcard subdomain (where the seller workspace doesn't live).

### 4. Storefront chip — cross-subdomain awareness

* `StorefrontSellerShortcut.jsx` now consumes `useStorefrontOwnerState`
  (so it sees the cookie on subdomains) AND rewrites the menu hrefs
  through `apexUrl()` when on a wildcard subdomain, so clicking
  "Shop" / "Sản phẩm" / etc. lands the owner on the apex seller
  workspace where ShopGuard can find its token.

### 5. Per-section preview pills in `/shop/settings`

* `SectionCard` now accepts `previewHref` / `previewLabel` props and
  renders a small green "Xem ↗" pill in the section header. Wired up
  for the 4 storefront-impacting sections:
  * **B. Storefront công khai** → `Mở trang chủ`
  * **C. Hình ảnh thương hiệu** → `Xem header`
  * **D. Giới thiệu doanh nghiệp** → `Xem giới thiệu`
    (`/<slug>.otofine.com/gioi-thieu`)
  * **E. Liên hệ & mạng xã hội** → `Xem liên hệ`
    (`/<slug>.otofine.com/lien-he`)
* Each pill opens in a new tab — keeps the seller's edit context
  intact while sanity-checking on the live storefront.

### 6. Trust badge expansion

* `deriveShopTrustBadges()` now emits a `catalog` badge when
  `productCount` ≥ 10, bucketed at `10+ / 50+ / 200+` so we display
  something concrete without leaking exact numbers (avoids
  "fake-looking precision"). Sourced from the same DB column the
  directory + JSON-LD already use — no new back-end work.
* `ShopTrustBadges.jsx` gets an indigo palette for the new
  `catalog` kind.

## Files changed

```
frontend/
├─ lib/auth/sellerOwnerCookie.js        (NEW)
├─ lib/shopsite/shopTrustBadges.js      (extended)
├─ hooks/useStorefrontOwnerState.js     (NEW)
├─ components/shopsite/StorefrontOwnerStrip.jsx        (NEW)
├─ components/shopsite/StorefrontSellerShortcut.jsx    (cookie + apexUrl)
├─ components/shopsite/ShopTrustBadges.jsx             (catalog palette)
├─ components/pages/ShopLogin.jsx       (writeOwnerCookie)
├─ components/pages/ShopAccount.jsx     (clearOwnerCookie)
├─ components/pages/ShopSettings.jsx    (per-section preview pills)
├─ components/Topbar.jsx                (clearOwnerCookie)
├─ app/(shopsite)/shops/[slug]/layout.js  (mount StorefrontOwnerStrip)
└─ app/globals.css                      (.storefront-owner-strip palette)
```

## Verification

* `npm run build` clean — no new TypeScript / lint diagnostics, all
  39 routes built (no regressions).
* `pm2 restart otofine-frontend` — service back up healthy.
* Smoke tests:
  * `GET https://otofine.com/shops/phutungoto355` → 200
  * `GET https://phutungoto355.otofine.com/`       → 200
  * `GET https://otofine.com/shop/settings`        → 200
* Owner detection on subdomain verified end-to-end: cookie-only
  context (no localStorage on the subdomain origin) successfully
  surfaces the chip + the new top strip.

## Screenshots

`audit/screenshots/seller-workspace/`

| File | Notes |
| ---- | ----- |
| `desktop-storefront-anon.png` | Negative case — no chip, no strip. |
| `desktop-storefront-owner-apex.png` | Strip + chip via localStorage path. |
| `desktop-storefront-owner-subdomain.png` | Strip + chip via cookie-only path (`phutungoto355.otofine.com`). |
| `desktop-storefront-owner-menu.png` | Chip dropdown with the 5 IA items + "Mở Seller Center". |
| `desktop-trust-badges.png` | New "200+ sản phẩm" chip in indigo. |
| `desktop-shop-settings-{public,branding,intro,contact}-section.png` | Per-section "Xem storefront" pills. |
| `iphone-*` / `android-*` | Same scenarios on mobile viewports. |

## Did NOT touch

* Storefront SEO (canonical URLs, robots, JSON-LD).
* Wildcard routing / `middleware.js`.
* RFQ matching pipeline.
* Upload pipeline (R2, sharp).
* Product APIs.
* Auth business logic (controllers, ShopGuard, requireAuth).
* Typesense / Discovery.
* Backend services (zero `.js` changes under `backend/`).
