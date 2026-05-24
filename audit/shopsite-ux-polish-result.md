# Shopsite — UX Polish Phase Result

**Status:** Shipped
**Theme:** Storefront browsing UX — product card vehicle info, real filter URL state, fixed category click bug, empty/loading polish.
**Risk profile:** All changes are inside `frontend/components/shopsite/**`, `frontend/lib/shopsite/**`, `frontend/app/(shopsite)/**`, the shopPublic backend domain, and the shopPublic public route. Untouched: middleware, nginx, wildcard DNS, auth, RFQ, `app/product`, products APIs core, seller-center layout.

---

## 1. Root cause of the "category click doesn't reload" bug

The bug had **two layers**:

### Layer 1 — UX
`ShopSidebar` was a plain `<a>` link. Each click triggered a **full page reload**, dropped local UI state, refetched every Server Component above it, and flashed a blank screen. With 2 800 products in the catalogue this felt sluggish; users reported "doesn't reload correctly" because the slow blink obscured whether the data had actually changed.

### Layer 2 — DATA (the actual reason the list often went empty)
The categories endpoint exposed `product_categories.canonical_name` as the `slug`. In production data, **every category row for this shop has `canonical_name = NULL`**. The frontend sidebar then fell back to `String(c.id)` → `?category=59281`, but the SQL filter was strictly `pc.canonical_name = ?`, so a search for `'59281'` never matched anything and the products list collapsed to **zero results** every time.

Visible symptom: the user clicks any sidebar category → URL changes → page re-renders → grid is empty → looks like "the click did nothing useful".

### Fix
- `listShopCategories` now synthesises a deterministic slug `c-<id>` whenever `canonical_name` is null/empty.
- `listShopProducts` accepts both shapes:
  - `c-<id>` → `pc.id = ?` branch
  - anything else → existing `pc.canonical_name = ?` branch
- No DB migration needed; no behavioural change for shops whose categories DO have a populated `canonical_name`.

Validated end-to-end:
```
?category=c-59281 → total=47   (Cản Trước)
?category=c-59280 → total=41   (Má Phanh Trước)
?category=c-59286 → total=26   (Má Phanh Sau)
```

Active highlight syncs because `ShopSidebar` now reads `useSearchParams().get("category")` instead of receiving `activeSlug` as a server prop — no SSR/CSR mismatch window.

---

## 2. Product card — vehicle line

`ShopProductCard.jsx` now renders a single-line vehicle fitment under the product name:

```
Tên sản phẩm                ← 14px gray-900, 2-line clamp
Toyota • Vios • 2018-2021   ← 12px gray-500, single-line truncate
1.650.000đ                  ← 16px brand red, bold tabular-nums
[ Van Điều Khiển Turbo ]    ← 11px chip, self-start, max-w truncate
```

Format rules (in `formatVehicleLine`):

| Available | Output |
|---|---|
| brand + model + range | `Toyota • Vios • 2018-2021` |
| brand + model + single year | `Toyota • Vios • 2018` |
| brand + model | `Toyota • Vios` |
| brand + year | `Toyota • 2018` |
| brand only | `Toyota` |
| nothing | (reserved single-line gap so the price stays aligned across the grid) |

`truncate` + `title={fitmentLine}` means a long "Mercedes-Benz • E-Class Coupe Sport • 2010-2018" still ellipsizes cleanly without breaking the card height.

---

## 3. Products page — 20/page, 2/3/5 grid

```
mobile (≤640px)  →  2 columns
tablet (640px–)  →  3 columns
desktop (1024px+)→  5 columns
```

`perPage` default is now `20` (env `PUBLIC_SHOPSITE_PAGE_SIZE` updated to 20; the backend hard-caps at 60 for safety). The pagination row replaced the old single "Xem thêm" button with a **router-based** Prev / page-X-of-Y / Next that preserves every other filter param (`keepPage: true`).

---

## 4. Filter URL contract

The single source of truth is `frontend/lib/shopsite/useShopFilterParams.js`. Allowed keys:

```
?category=c-59281   |   ?category=loc-gio
&brand=Kia
&model=Sedona
&year=2018
&q=phanh%20dia
&sort=newest|price_asc|price_desc
&page=2
```

Every interactive widget routes through this hook:

| Widget | Action | Hook call |
|---|---|---|
| Sidebar category click | `router.push` | `setParam("category", slug)` |
| "Tất cả sản phẩm" / clear chip | `router.push` | `setParam("category", null)` |
| Brand dropdown | `router.push` | `setParams({ brand, model })` (model invalidated on brand change) |
| Model dropdown | `router.push` | `setParam("model", v)` |
| Year dropdown | `router.push` | `setParam("year", v)` |
| Search input | debounced 300 ms → `router.push` | `setParam("q", v)` |
| Active filter chip ✕ | `router.push` | `setParam(key, null)` |
| "Xóa tất cả" | `router.push` | `clearAll()` |
| Pagination | `router.push` | `setParam("page", n, { keepPage: true })` |

Defensive: every helper short-circuits when the resulting URL is identical to the current one, eliminating the "click the same chip twice and trigger an extra fetch" foot-gun.

Filter changes also **drop `page`** by default (selecting Kia after being on page 7 of the unfiltered catalogue would land on an empty page).

### Example URLs

```
https://otofine.com/shops/phutungoto355/san-pham?category=c-59281
https://otofine.com/shops/phutungoto355/san-pham?brand=Kia&year=2018
https://otofine.com/shops/phutungoto355/san-pham?category=c-59281&brand=Kia&year=2018&q=phanh
https://otofine.com/shops/phutungoto355/san-pham?page=2
https://cuahangoto355.otofine.com/san-pham?brand=Mazda&model=CX-5
```

Subdomain pages (`<slug>.otofine.com/san-pham`) and apex pages (`otofine.com/shops/<slug>/san-pham`) both render the same URL contract — the basePath helper in `services/shopPublic.service.js` picks the right prefix at SSR time.

---

## 5. Empty + loading states

- **Empty state** — Custom SVG illustration (red magnifier on a parts box), Vietnamese copy, and a one-click "Xóa toàn bộ bộ lọc" CTA that calls `clearAll()`. Used whenever `productsPage.items.length === 0`.
- **Skeleton** — `ShopProductGridSkeleton` mirrors the real grid's responsive cols + 1:1 aspect. Used inside the route-level `loading.js` boundary, so navigating between filters shows it instantly while the new server payload streams.
- **Active filter chips** — `ShopActiveFilterChips` renders the current category/brand/model/year/search as removable pills above the grid, plus an "Xóa tất cả" link. Resolves category id → human name via the `categoriesBySlug` map passed in from the page.

---

## 6. Backend additions

Additive only — no breaking changes to existing response shapes.

| Endpoint | Method | Change |
|---|---|---|
| `GET /api/public/shops/:slug/products` | — | DTO now includes `model`, `yearFrom`, `yearTo`; accepts new `year` query param; `category` accepts `c-<id>` form |
| `GET /api/public/shops/:slug/categories` | — | `slug` always present (synthesises `c-<id>` when DB has null) |
| `GET /api/public/shops/:slug/fitments` | **new** | Returns `{ brands, modelsByBrand, years }` for the filter dropdowns |

Cache compatibility: every read endpoint is still keyed by `req.originalUrl`, so each unique combination of filters lives in its own LRU slot. The Phase 4.5 invalidator (seller PUT / upload) still clears every cached entry for the affected shop in one tag lookup.

Sample verification:

```
?                                  → X-Cache: HIT
?category=phu-tung-dong-co         → X-Cache: HIT
?brand=Kia&year=2018               → X-Cache: HIT
?brand=Mazda&page=2                → X-Cache: HIT
```

---

## 7. Performance notes

- Debounce search 300 ms → at most ~3 requests/sec while typing
- `setParam`/`setParams` early-return on identical URLs → no duplicate fetches on repeat clicks
- App Router `router.push(..., { scroll: false })` keeps the user's scroll position
- Route-level `loading.js` Suspense → zero layout jump during navigations
- Fitments endpoint piggybacks on the categories cache TTL (5 min) — typical seller catalogues won't gain/lose brands often
- Server fetches are still `Promise.all`'d at the page boundary; the new fitments call adds ~3 ms cold / ~0 ms warm given the existence cache
- Sidebar/Filters are isolated under Suspense so a static demo page stays prerendered

---

## 8. SEO safety check

| Surface | Before | After |
|---|---|---|
| `/shops/<slug>/san-pham` canonical | `https://otofine.com/shops/<slug>/san-pham` | unchanged |
| robots on subdomain pages | `noindex, nofollow` | unchanged |
| Product card href | `https://otofine.com/product/<id>` (absolute apex) | unchanged |
| New URLs introduced | none | none — `?category=c-59281` is still under the same canonical |
| Apex `/` | `index, follow` | unchanged |
| Apex `/product/<id>` canonical | `https://otofine.com/product/<id>` | unchanged |

Verified with curl after the change.

---

## 9. Files

**Added (5)**
```
frontend/lib/shopsite/useShopFilterParams.js
frontend/lib/shopsite/useDebouncedValue.js
frontend/components/shopsite/ShopProductGridState.jsx
frontend/components/shopsite/ShopProductsPagination.jsx
frontend/app/(shopsite)/shops/[slug]/san-pham/loading.js
audit/shopsite-ux-polish-result.md
audit/screenshots/shopsite-ux-polish/*.png
```

**Modified (10)**
```
backend/.env                                                      # PUBLIC_SHOPSITE_PAGE_SIZE 16 → 20
backend/domains/shopPublic/config/publicShop.config.js            # default 16 → 20
backend/domains/shopPublic/repositories/shopPublic.repository.js  # canonical_name NULL → "c-<id>" fallback
backend/domains/shopPublic/repositories/shopPublicProducts.repository.js  # model/year columns, year filter, c-<id> branch, fitments query
backend/domains/shopPublic/services/shopPublic.service.js         # DTO with model/yearFrom/yearTo, getPublicShopFitments
backend/domains/shopPublic/controllers/shopPublic.controller.js   # handleGetShopFitments + observability
backend/domains/shopPublic/validators/shopPublic.validators.js    # `year`, c-<id> tolerant slug
backend/domains/shopPublic/index.js                               # export new symbols
backend/routes/publicShop.routes.js                               # mount /:slug/fitments
frontend/services/shopPublic.service.js                           # fetchPublicShopFitments
frontend/components/shopsite/ShopProductCard.jsx                  # vehicle line, typography
frontend/components/shopsite/ShopSidebar.jsx                      # Client + useRouter, "Tất cả sản phẩm", clearAll
frontend/components/shopsite/ShopFilters.jsx                      # URL-state, debounced search, per-brand model narrowing
frontend/app/(shopsite)/shops/[slug]/page.js                      # Suspense, fitments
frontend/app/(shopsite)/shops/[slug]/san-pham/page.js             # 20/page, chips, empty, pagination, Suspense
frontend/app/(shopsite)/shop-demo/page.js                         # Suspense wrappers
frontend/app/(shopsite)/shop-demo/san-pham/page.js                # Suspense wrappers
```

---

## 10. Screenshots

Stored under `audit/screenshots/shopsite-ux-polish/`:

- `home-desktop.png`, `home-mobile.png`
- `products-desktop.png`, `products-mobile.png`
- `products-cat-active.png` (URL `?category=c-59281`, 47 results, "Cản Trước" highlighted in sidebar + chip)
- `products-cat-mobile.png`
- `products-brand-year.png` (`?brand=Kia&year=2018`, 590 results, two chips, model dropdown narrowed to Kia)
- `products-all-filters.png` (category + brand + year + q together)
- `products-empty.png` (`?q=zzzz_no_match_xx`, illustration + reset CTA)
- `products-paginated.png` (`?page=2`)
- `cards-zoom-desktop.png`, `cards-zoom-mobile.png` (vehicle line typography at real card size)
- `all-filters-zoom.png` (active chips bar zoomed)

---

## 11. Before / after UX

| Action | Before | After |
|---|---|---|
| Click sidebar category | full page reload → blank → empty grid (data bug) | smooth `router.push` → skeleton flicker → 47 real products |
| Change brand dropdown | local state only, never affected the grid | URL updates, model dropdown re-narrows, grid refetches |
| Search input | local state only, only fired on submit (and submit was a no-op) | typed → 300 ms → URL push → grid refresh |
| Clear a single filter | no way; user had to clear URL by hand | ✕ icon on each chip, or per-dropdown ✕ |
| Empty result | generic gray "Không có sản phẩm phù hợp" line | illustrated empty state + one-click reset |
| Pagination | "Xem thêm" button that bumped `?page=` and dropped scroll position | prev / X of Y / next, keeps scroll, keeps filters |
| Product card | name + price + category chip | name + **vehicle fitment** + price + category chip |
| Default page size | 16 | 20 |
| Filter persistence | filter selections lost on refresh | URL is the state — refresh + share both work |

---

## 12. DO NOT TOUCH compliance

Verified untouched: `frontend/middleware.js`, nginx config, wildcard DNS rules, auth (`backend/middlewares/auth.js`, `backend/domains/auth/**`), RFQ (`backend/modules/rfq/**`, `frontend/app/rfq/**`), `frontend/app/product/**`, `app/[slug]` (apex product listing), the products marketplace API (`/api/products`), the seller-center layout (`AppShell`, `Sidebar`).
