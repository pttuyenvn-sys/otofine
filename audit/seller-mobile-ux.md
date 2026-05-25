# Seller-Center Mobile UX Pass

Dedicated mobile-first refactor for `/shop/settings`, `/shop/products`,
and seller navigation. The desktop seller-center experience is
visually unchanged; phones now get an app-like, low-clutter shell
modeled after Shopee Seller / TikTok Shop Seller / Meta Business
Suite.

**Scope guardrails (followed):** no schema changes, no API changes,
no middleware/auth/routing changes, no storefront SEO regressions, no
edits to product canonical URLs, no edits to wildcard routing, no
changes to RFQ matching, no changes to Typesense, no changes to the
upload pipeline, no business-logic mutations. Every action the user
could perform before this pass is still reachable, just relocated for
phones.

---

## 1. Mobile seller bottom nav

`frontend/components/SellerMobileBottomNav.jsx`

- 4 destinations:
  1. 🏪 **Shop** → `/shop/settings`
  2. 📦 **Sản phẩm** → `/shop/products`
  3. 💬 **Khách hàng** → `/rfq/shop/inbox` (with unread badge)
  4. 👤 **Tài khoản** → `/shop/account`
- Visible only under 900 px (CSS gate); hidden on desktop where the
  sidebar remains the canonical nav.
- Mounted in `app/layout.js` next to `<AppShell>` so it remains
  visible on `/rfq/shop/*` (where AppShell is intentionally hidden).
- Visibility is **path + auth gated**: the bar SSR-renders to `null`,
  then on hydration it reads `localStorage.auth.role === "shop"` and
  checks the current pathname against a small allowlist
  (`/shop/settings`, `/shop/products`, `/shop/account`,
  `/shop/change-password`, `/shop/add-product`, `/rfq/shop/*`). Buyers,
  marketing pages, login pages, and unauthenticated visitors never see
  it.
- Unread badge reuses the existing `useShopInboxSummaryBadge` hook
  (60 s polling, tab-visibility aware), so the bottom-nav badge and
  the sidebar badge are always in sync.
- Safe-area aware via `env(safe-area-inset-bottom)`; the bar grows
  past the iOS / Android home indicator without being clipped.
- Active state: green `#10b981` accent + 28 px top tab indicator;
  prefix-matches deep links (e.g. `/shop/products` keeps the Sản phẩm
  tab lit while AddProductPopup is open).
- Z-index `60` so it sits above page chrome but below modals
  (`>= 80`).

### Bottom-nav clearance

`frontend/app/globals.css`

- `.main-content` mobile padding-bottom now reserves
  `calc(64px + env(safe-area-inset-bottom) + 12px)` so the sticky
  save bar in Settings and the mobile pager in Products never sit
  under the nav.
- Equivalent padding is applied to `.rfq-scope .rfq-seller-wide` /
  `.rfq-inbox-page` so the RFQ inbox (which lives outside AppShell)
  also clears the nav.

## 2. `/shop/account` account hub

`frontend/app/shop/account/page.js` (ShopGuard-wrapped) →
`frontend/components/pages/ShopAccount.jsx`

A new mobile-first landing page for the Tài khoản tab. Pure UI on top
of existing APIs:

- Header shows the seller's email (read from `localStorage.auth`).
- Five rows, each is a large tap target with icon + label +
  subtitle:
  - **Cài đặt shop** → `/shop/settings`
  - **Sản phẩm** → `/shop/products`
  - **Tin nhắn khách hàng** → `/rfq/shop/inbox`
  - **Đổi mật khẩu** → `/shop/change-password`
  - **Đăng xuất** → clears `localStorage` and broadcasts the existing
    `auth-changed` event before pushing to `/shop/login`. Identical to
    the Topbar's logout path.

Desktop visitors get the same hub (it's stateless), but the bottom
nav that drives traffic into it is mobile-only.

## 3. `/shop/settings` mobile compression

`frontend/components/pages/ShopSettings.jsx`,
`frontend/components/pages/shop-settings/ShopMetricsOverview.jsx`,
`frontend/components/pages/shop-settings/ShopSeoPreviewPanel.jsx`,
`frontend/app/globals.css`

### Section chrome

`SectionCard` is mobile-first now:

- Outer radius: `rounded-xl` on mobile, `rounded-2xl` on desktop.
- Header padding: `px-3.5 py-3` (was `px-5 py-4`).
- Body padding: `p-3.5 sm:p-5 lg:p-6` (was `p-5 sm:p-6`).
- Title `text-[15px]` on mobile, subtitle `text-[12px]` with
  `leading-snug` so the section header never costs more than ~36 px.

### Page header

- `mb-3 sm:mb-6` instead of `mb-6` — sections start sooner.
- Title `text-xl sm:text-2xl`, subtitle trimmed to a single line on
  phones.

### Jump-to chip rail

- Now `hidden lg:flex`. The bottom nav covers fast-navigation on
  phones; the chip rail was redundant and crowded the top of the
  viewport.

### Form gaps

- `space-y-3 sm:space-y-6` so consecutive `SectionCard`s sit closer
  on phones; desktop is unchanged.

### Sticky save bar

- Negative margin matches the new mobile gutter (`-mx-3 sm:-mx-6`).
- Secondary "Đổi mật khẩu" link hidden on mobile — Tài khoản tab
  already exposes Đổi mật khẩu, so duplicating it crowds the bar.
- Mobile bar collapses to a single row with the save button taking
  the full remaining width (`flex-1 sm:flex-initial`), keeping save
  one tap away even with the keyboard up.

### Metrics overview

- Card padding tightened on mobile (`px-2.5 py-2.5` vs `px-4 py-3.5`
  on desktop).
- Icon tile shrinks from `40 × 40` to `32 × 32` on phones.
- Grid gap drops from `gap-3` to `gap-2`.
- Header spacing collapsed to `mb-3 sm:mb-4`.
- Section title/label sizes preserved; 2-column on phones,
  1×4 row on desktop — unchanged.

### SEO preview panel — mobile collapse

- New `useMobileCollapse(false)` hook in
  `ShopSeoPreviewPanel.jsx`: defaults to **collapsed on phones**,
  **expanded on desktop**, doesn't reset on orientation change.
- The header (score + progress bar) is always visible; tapping the
  chevron reveals the per-gate suggestions and the Facebook /
  Google preview cards.
- Desktop renders the panel exactly as before — the chevron is not
  shown above the `lg` breakpoint, so visual parity is preserved.

### Desktop padding preserved

- `.main-content.shop-settings-page { padding: 16px 24px; }` mirrors
  the original inline style without breaking the new mobile rule
  (`@media (max-width: 900px)` overrides both `.main-content` and
  the settings variant to `padding: 12px` + bottom-nav reserve).

## 4. `/shop/products` mobile rework

### Toolbar split

`frontend/components/pages/products/ShopProducts.jsx`

- Desktop toolbar (`.AdminTieude`, 4 inline buttons, full filter
  grid) is untouched.
- Mobile toolbar replaces the 4-button row with:
  - Primary CTA: green `+ Thêm` (opens `AddProductPopup` — same
    handler).
  - Overflow `⋮` button → opens `ProductsActionsSheet` (new
    component) containing **Import Ảnh**, **Import Sản phẩm**, and
    **Kết xuất Excel** with subtitles.
- Sheet is **lazy mounted** (renders `null` when closed) so no
  hidden listeners or DOM leaks; body-scroll-lock + Esc handler
  match the existing shopsite mobile sheets.
- The legacy `.AdminTieude` rule now collapses to `display: none`
  under `1024 px` — fixed the CSS specificity bug where Tailwind's
  `hidden` lost to `.AdminTieude { display: flex; }` defined in
  `Product.css`.

### Filter compression

`frontend/components/products/ProductFilter.jsx`,
`frontend/components/products/ProductFilterMobile.jsx`

- Desktop filter wrapped in `hidden lg:block`.
- New mobile filter renders below `lg`:
  - Compact search input (full width, Enter / blur commits keyword).
  - "☰ Lọc" pill with an emerald badge showing the count of active
    secondary filters (brand / model / origin).
  - Sheet body uses the same `getShopProductFilterOptions` endpoint
    as the desktop filter; same `onSearch(filters)` callback wiring,
    so applied filters are identical between layouts.
  - Apply / Reset CTAs sit on a sticky footer inside the sheet.

### Product list — mobile cards

`frontend/components/pages/products/ProductMobileList.jsx`,
`frontend/components/pages/products/ProductMobileCard.jsx`

- Desktop continues to render `<ProductTable>` (no change to the 14-
  column dense table).
- Mobile renders a stack of `ProductMobileCard`s — image, title (2-
  line clamp), partNumber + fitment one-liner, price (red, tabular
  nums), stock chip with tonal feedback (green in stock, amber when
  `< 5`, gray when `0`), and a kebab `⋮` menu housing **Sửa / Xem
  ảnh** and **Xóa**.
- Tapping the thumbnail or the title row opens the existing
  `AddProductPopup` in edit mode — same handler the desktop "Xem"
  button uses.
- Selection: row checkbox on the left ties into the same
  `selectedIds` state, so the "🗑 Xóa (N)" bulk button (mobile pill)
  and the legacy "Xóa All" button (desktop) operate on a single
  source of truth.
- Header row shows "Chọn tất cả (N)" / "Đã chọn x/N" so the
  selection cardinality is visible without a separate scroll.

### Pagination compression

`frontend/components/pages/products/ProductList.jsx`

- Desktop pager (page-size selector + numeric pages) wrapped in
  `hidden lg:flex` — unchanged.
- Mobile pager: a single-line `‹ Trước  N/M  Sau ›` row anchored
  below the card stack. Renders only when `totalPages > 1`.
- Top-of-list mobile summary: `2,806 sản phẩm · Trang 1/141`,
  tabular numerals.

### Quick actions parity

| Action            | Desktop                    | Mobile                              |
|-------------------|----------------------------|-------------------------------------|
| Add product       | Top toolbar "Thêm mới"     | Top toolbar "+ Thêm" CTA            |
| Import ảnh        | Top toolbar inline button  | Overflow sheet                       |
| Import sản phẩm   | Top toolbar inline button  | Overflow sheet                       |
| Xuất Excel        | Top toolbar inline button  | Overflow sheet                       |
| Edit / Xem ảnh    | Row "Xem" button           | Tap card OR kebab → "Sửa / Xem ảnh" |
| Delete one        | Row "Xóa" button           | Kebab → "Xóa"                       |
| Delete selected   | "Xóa All" button           | Compact pill "🗑 Xóa (N)"           |
| Filter            | Inline 3-col grid          | Compact search + filter sheet       |
| Pagination        | Numeric pager              | `‹ Trước  N/M  Sau ›`               |

Every action survives; nothing is hidden behind a hover-only or
desktop-only surface.

## 5. Performance / hydration safety

- No additional API calls on phones. The new components share the
  same product list, filter options, and metrics endpoints already
  used by desktop.
- Sheets (`ProductsActionsSheet`, mobile filter, kebab menus) lazy-
  mount via `if (!open) return null;` — no hidden listeners, no
  unmounted DOM bloat.
- Desktop `<ProductTable>` mounts inside `hidden lg:block`; mobile
  `<ProductMobileList>` mounts inside `lg:hidden`. Tailwind utility
  classes are pure CSS, so Next.js SSR produces the same markup
  client-and-server-side — no hydration mismatch.
- `SellerMobileBottomNav` SSR-renders to `null` (no `authed` until
  hydration), then flips on; no markup hydration mismatch is
  possible because the server emits nothing.
- The collapsible SEO panel reads `matchMedia` only in
  `useEffect`, defaults to expanded server-side, so it never causes
  a layout shift on desktop.
- Build size delta is small: `/shop/products` went 71 kB → 72.6 kB
  (≈ +1.6 kB shared chunks), `/shop/settings` went 16.0 kB →
  16.2 kB. New `/shop/account` route is 2.0 kB.

## 6. Files touched

**New (8):**

- `frontend/components/SellerMobileBottomNav.jsx`
- `frontend/components/pages/ShopAccount.jsx`
- `frontend/app/shop/account/page.js`
- `frontend/components/pages/products/ProductMobileList.jsx`
- `frontend/components/pages/products/ProductMobileCard.jsx`
- `frontend/components/pages/products/ProductsActionsSheet.jsx`
- `frontend/components/products/ProductFilterMobile.jsx`
- `audit/seller-mobile-ux.md` (this doc)

**Modified (8):**

- `frontend/app/layout.js` — mounts `<SellerMobileBottomNav />`.
- `frontend/app/globals.css` — bottom-nav CSS + `.main-content`
  mobile gutter + bottom reserve + RFQ scope clearance.
- `frontend/components/pages/ShopSettings.jsx` — tighter section
  chrome, mobile-first form gaps, sticky save bar polish,
  conditional jump-rail.
- `frontend/components/pages/shop-settings/ShopMetricsOverview.jsx`
  — tighter cards, smaller icons, denser grid on phones.
- `frontend/components/pages/shop-settings/ShopSeoPreviewPanel.jsx`
  — mobile-collapse hook + chevron affordance.
- `frontend/components/pages/products/ShopProducts.jsx` — mobile
  toolbar with `+ Thêm` / `⋮` and ActionsSheet.
- `frontend/components/pages/products/ProductList.jsx` — desktop /
  mobile table swap, compact mobile bulk-delete and pagination.
- `frontend/components/pages/products/Product.css` — hides legacy
  `.AdminTieude` toolbar under `1024 px` (CSS specificity fix).
- `frontend/components/products/ProductFilter.jsx` — wraps the
  desktop filter in `hidden lg:block`.

## 7. Verification

Build:

```
npm run build
✓ Compiled successfully in 25.1s
✓ Generating static pages (32/32)
```

Smoke:

```
GET /shop/account        → 200
GET /shop/settings       → 200
GET /shop/products       → 200
```

Screenshots (`audit/screenshots/seller-mobile/`):

| Surface                  | iPhone 390 | Android 412 | Desktop 1440 |
|--------------------------|:----------:|:-----------:|:------------:|
| `/shop/settings` top     | ✓          | ✓           | ✓            |
| `/shop/settings` full    | ✓          | ✓           | ✓            |
| `/shop/products` top     | ✓          | ✓           | ✓            |
| `/shop/products` full    | ✓          | ✓           | ✓            |
| Action overflow sheet    | ✓          | ✓           | n/a          |
| Filter sheet             | ✓          | ✓           | n/a          |
| `/shop/account`          | ✓          | ✓           | ✓            |
| Bottom-nav crop          | ✓          | ✓           | n/a          |

Desktop screenshots confirm zero regression — the seller sidebar
still anchors the page, the products toolbar still renders 4 inline
buttons, the products table still uses the legacy 14-column layout,
the settings form retains the desktop two-column grid, and the
metrics overview keeps the desktop 1×4 row.
