# Storefront / seller refine — UX + product-intelligence pass

Additive, mobile-first refinement of the storefront and seller surfaces.
Nothing in this pass touches SEO, canonical URLs, routing, the wildcard
middleware, auth, the RFQ engine core, or the upload pipeline.

## 1. Storefront product card — fitment line restored on mobile

`frontend/components/shopsite/ShopProductCard.jsx`

- Removed the `hidden sm:block` gate on the fitment line; it now renders
  on every breakpoint as a single truncated line.
- Reordered the card body so both desktop and mobile follow the same
  hierarchy: **image → name → price → fitment → CTA**.
- Mobile uses a tighter `text-[11px] mt-0.5` so the card height stays
  flat. Desktop keeps the legacy `text-[12px]` + "Loại hàng" chip below
  the fitment line.

Verified in
`audit/screenshots/storefront-seller-refine/12-storefront-mobile-cards.png`
and `13-storefront-desktop-cards.png` — every card now shows
`Peugeot • 508 • 2015` (or equivalent) under the price.

## 2. Removed duplicate hero search

`frontend/components/shopsite/ShopHeader.jsx`

- Dropped the mobile-only `<form action=".../san-pham">` "Tìm trong
  shop…" block from the hero (section C). The hero still surfaces the
  shop's short description when present.
- The main search lives unchanged below the hero in `ShopFilters`
  (desktop) / `ShopMobileFilters` (mobile), so the seller's storefront
  now has a single search affordance.

Verified in
`audit/screenshots/storefront-seller-refine/01-storefront-mobile-home.png`.

## 3. Product-count wording — single source of truth

| Surface | Before | After |
| --- | --- | --- |
| `ShopTrustBadges` (hero strip) | `200+/50+/10+ sản phẩm` (3 buckets) | `bucketProductCount()` → `10+/50+/100+/200+/500+/1.000+/2.000+/3.000+/5.000+` |
| `ShopLiveActivityStrip` (below hero) | `2.000+/1.000+/.../50+ sản phẩm trên kệ` | wording only: `Kho hàng lớn · hàng nghìn phụ tùng` or `Kho hàng đa dạng` |
| `ShopWhyChooseUs` | `200+/50+/10+ sản phẩm sẵn kho` | wording only: `Catalogue đa dạng` / `Catalogue đang phát triển` |
| `ShopSocialProofPills` (khách đã chọn) | unchanged (`bucketCustomers(productCount * 10)`) | unchanged — different metric |

Result: only ONE numeric "X+ sản phẩm" claim per page (in the hero
trust strip), so the storefront no longer shows contradictory
buckets like "200+ sản phẩm" next to "2.000+ sản phẩm trên kệ".

Verified in `03-storefront-desktop-home.png` — hero shows
`2.000+ sản phẩm`; the activity strip below says
`Kho hàng lớn · hàng nghìn phụ tùng` (no number).

## 4. Seller-declared "Hoạt động từ năm"

- Migration `backend/migrations/045_shops_founded_year.sql` adds
  `shops.founded_year SMALLINT NULL`. Idempotent via
  `information_schema` check (works on MySQL 8.0.x).
- `backend/domains/shopPublic/repositories/sellerPublicPage.repository.js`
  adds `founded_year` to both the owner `SELECT` column list and the
  `PATCHABLE_COLUMNS` allowlist.
- `backend/domains/shopPublic/validators/sellerPublicPage.validators.js`
  accepts `founded_year` or `foundedYear` (either case), clamps to
  `[1900, currentYear]`, returns `400` with a Vietnamese message on
  out-of-range.
- `backend/domains/shopPublic/services/shopPublic.service.js` now
  projects `foundedYear` on the public DTO and the storefront tenure
  field (`trust.establishedYears`) uses
  `yearsFromFoundedOrDate(row.founded_year, row.published_at || row.createdAt)`.
- `backend/domains/shopPublic/repositories/shopPublic.repository.js`
  adds `s.founded_year` to `PUBLIC_SHOP_COLUMNS` so the public route
  reads the new column. Cache invalidation already exists in the
  controller (`invalidateShop(slug)`).
- `frontend/app/(shopsite)/shops/[slug]/gioi-thieu/page.js` `joinYears`
  now prefers `shop.foundedYear` then `trust.establishedYears` then
  `publishedAt → createdAt`.
- `frontend/components/pages/ShopSettings.jsx` exposes the new field
  with an inline live-preview hint
  `→ Storefront sẽ hiển thị "16+ năm kinh nghiệm"`.

E2E verified:

```text
PUT  founded_year = 2010  →  toSellerDto foundedYear = 2010
public /api/public/shops/phutungoto355 →
   foundedYear: 2010
   trust.establishedYears: 16
PUT  founded_year = null  →  trust.establishedYears falls back to createdAt
PUT  founded_year = 1800  →  400 "Năm hoạt động phải nằm trong khoảng 1900 - 2026"
```

Screenshots: `11-shop-settings-mobile-founded-year.png`,
`14-storefront-mobile-about-stats.png` (renders "16+ năm Kinh nghiệm").

## 5. `/shop/products` pagination + mobile page-size

`frontend/components/pages/products/ProductList.jsx`

- Mobile total/page bar is no longer a static label — it now hosts a
  `Hiển thị 20/50/100` `<select>` so sellers can change page size on
  phones (parity with desktop).
- Mobile bottom pager now renders whenever `data.length > 0` (not only
  when `totalPages > 1`), and clamps `page` to `[1, totalPages]` so the
  "Sau ›" button can never overshoot.

Verified: `/api/products/shop?page=1&limit=20` returns
`{items: 20, total: 4529, page: 1, limit: 20}` and the desktop pager
renders `‹‹‹ [1] 2 3 ... 141 ›››`. Mobile shows
`2.806 sản phẩm · Hiển thị [20▾] · Trang 1/141`.

## 6. Smart autocomplete on product create/edit

- New component `frontend/components/ui/AutocompleteInput.jsx`:
  debounce (180 ms), module-scoped LRU cache (200 entries), keyboard
  navigation (↑↓ Enter/Tab, Esc), outside-click + Esc close, mobile
  tap targets, no extra layout shift. Silent failure mode (network /
  4xx collapses the dropdown but never blocks typing).
- `frontend/components/popup/AddProductPopup.jsx` wires the
  autocomplete on two fields:
  - `Tên phụ tùng` → `GET /api/product-categories/search?q=` (canonical
    "loại phụ tùng" dictionary, returns `category_name` +
    `canonical_name` + `product_count` — surfaced as the value plus a
    `63 SP` hint chip on the right).
  - `Xuất xứ` → `GET /api/products/shop/filters` (the seller's own
    distinct `origins` list, cached at the module level, client-side
    prefix-filtered so typing doesn't hammer the backend).
- No new endpoints introduced; both sources existed already.

Verified in `07-product-autocomplete-mobile.png` — typing "Lọc" surfaces
`Lọc Gió Động Cơ 63 SP / Lốc Điều Hòa 49 SP / Lọc Xăng 48 SP / …`.

## 7. RFQ inbox tabs — full visibility, no horizontal scroll

`frontend/app/rfq/rfq-scope.css`

- `.rfq-chip-row--inbox` flipped from `flex-wrap:nowrap; overflow-x:auto`
  to `flex-wrap:wrap; overflow-x:visible`. The legacy
  `::-webkit-scrollbar { display:none }` rule was removed too.
- Mobile chip dimensions compress to `height: 32px; padding: 0 12px;
  font-size: 13px` (was `38px/0 16px/15px`) so all five pills fit on at
  most two rows without truncation.

`frontend/lib/rfq/rfqInboxFilters.js` — shortened the longest label
from `Hết hạn / trễ` → `Hết hạn` to keep wrap clean.

Verified in `09-rfq-inbox-desktop-tabs.png` (sidebar wraps to two rows)
and `10-rfq-inbox-mobile-tabs.png` (one row of 4 + one row of 1).

## 8. RFQ inbox sort — confirmed newest first

Sort already correct in
`backend/modules/rfq/repositories/rfqDispatch.repository.js`
`listInboxForShop` activity branch:

```sql
ORDER BY
  (d.first_viewed_at IS NULL) DESC,
  <shop-unread-message-count> DESC,
  COALESCE(latest_message_time, web_notified_at, created_at) DESC,
  d.id DESC
```

`useShopInboxList` keeps prev row references when the fingerprint
multiset matches, and re-emits server order when fingerprints change.
`inboxRowFingerprint` includes `updated_at`, `message_unread_count`,
`status`, `rfq_status`, `first_viewed_at`, `last_message_*`,
`needs_shop_response`, `has_submitted_quote`, and the buyer-intent
fields — so a buyer's new message or activity correctly bumps the row
up. No code change required this pass.

Confirmed on `09-rfq-inbox-desktop-tabs.png` / `10-...mobile-tabs.png`:
unread (`Khách vừa nhắn`) HOT rows sit above already-viewed rows.

## Safety / rollback

- Migration 045 is fully reversible:
  `ALTER TABLE shops DROP COLUMN founded_year;`.
- All other changes are additive component-level edits; reverting
  individual file diffs restores prior behaviour.
- No SEO meta, canonical, sitemap, robots, JSON-LD, structured-data,
  middleware, or routing rules touched.
- Verified with frontend `npm run build` (clean) and a backend restart
  followed by REST round-trip on the new field.

## Screenshots

All under `audit/screenshots/storefront-seller-refine/`:

| File | Surface |
| --- | --- |
| `01-storefront-mobile-home.png` | Mobile homepage — no duplicate hero search |
| `02-storefront-mobile-gioi-thieu.png` | Mobile `/gioi-thieu` (header context) |
| `03-storefront-desktop-home.png` | Desktop homepage — "2.000+ sản phẩm" hero, wording-only activity strip |
| `04-storefront-desktop-gioi-thieu.png` | Desktop `/gioi-thieu` |
| `05-seller-products-desktop.png` | Pagination row `‹‹‹ [1] 2 3 … 141 ›››` |
| `06-seller-products-mobile.png` | Mobile total + page-size select + pager footer |
| `07-product-autocomplete-mobile.png` | "Lọc" → 7 canonical part-name suggestions |
| `08-product-autocomplete-desktop.png` | Same dropdown in the desktop popup |
| `09-rfq-inbox-desktop-tabs.png` | All five buckets visible (wrap, no scroll) |
| `10-rfq-inbox-mobile-tabs.png` | All five buckets on two rows |
| `11-shop-settings-mobile-founded-year.png` | "Hoạt động từ năm" input + live hint |
| `12-storefront-mobile-cards.png` | Mobile cards with fitment line restored |
| `13-storefront-desktop-cards.png` | Desktop cards — hierarchy image→name→price→fitment→chip→CTA |
| `14-storefront-mobile-about-stats.png` | `Thống kê shop` showing `16+ năm Kinh nghiệm` |
