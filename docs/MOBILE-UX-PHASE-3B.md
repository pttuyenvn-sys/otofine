# MOBILE-UX-PHASE-3B — Mobile Shop BottomSheet

**Mode:** IMPLEMENT (Phase 3B only)  
**Date:** 2026-06-28  
**Scope:** Bottom nav **Shop** → BottomSheet → recommended shops (reuse marketplace shop directory)

---

## Summary

Replaced bottom nav `router.push("/shop/login")` with **`setMobileShop(true)`** opening a BottomSheet that lists **Shop phù hợp** via existing `GET /api/public/shops`. Desktop right rail unchanged visually; shared `ShopRecommendSection` + helper map marketplace `brand` / `location` → directory query (including **provinceSlug**).

**No new backend, API, SQL, ranking, or routes.**

---

## Files changed

| File | Change |
|------|--------|
| `frontend/components/pages/home/sections/ShopRecommendSection.jsx` | **New** — shared shop list + single fetch |
| `frontend/components/pages/home/sections/ShopRecommendRail.jsx` | Re-export shim → `ShopRecommendSection` |
| `frontend/components/pages/home/shop/mapMarketplaceToShopDirectoryParams.js` | **New** — title / query / directoryHref mapper |
| `frontend/components/pages/home/shop/buildShopDirectoryFetchUrl.js` | **New** — shared API URL builder |
| `frontend/components/pages/home/sections/MobileShopSellerSection.jsx` | **New** — guest / seller footer links |
| `frontend/components/pages/home/sections/MobileDrawers.jsx` | Shop BottomSheet |
| `frontend/components/pages/home/sections/RightRail.jsx` | Uses `ShopRecommendSection` + context |
| `frontend/components/pages/Home.jsx` | `mobileShop`, `shopDirectoryContext`, bottom nav |
| `frontend/components/pages/Home.css` | Mobile shop sheet + seller footer styles |

**Not changed:** Search, Discovery, SEO, sitemap, URL builders, backend.

---

## Architecture

```
Home.jsx
├── shopDirectoryContext = mapMarketplaceToShopDirectoryParams({ brand, location, availableLocations })
│
├── RightRail (desktop)
│   └── ShopRecommendSection variant="desktop"
│
└── MobileDrawers
    └── mobileShop BottomSheet
        ├── header: context.title
        ├── ShopRecommendSection variant="mobile"
        ├── Link: Xem tất cả Shop → (context.directoryHref)
        └── MobileShopSellerSection
```

### Shared fetch (one loader)

```javascript
buildShopDirectoryFetchUrl(query) → GET /api/public/shops?sort=rank&perPage=5&...
fetchJsonCached(url, { ttlMs: 120_000 })
```

Desktop and mobile share **the same URL** for identical `query` → **one cache entry**, no duplicate fetch logic.

---

## Helper: `mapMarketplaceToShopDirectoryParams`

| Marketplace state | title | query | directoryHref |
|-------------------|-------|-------|---------------|
| No brand, no location | Shop nổi bật | `{}` | `/shops` |
| Brand only | Shop chuyên Toyota | `{ brand }` | `/shops?brand=Toyota` |
| Province only | Shop tại Hà Nội | `{ provinceSlug }` | `/shops?province=ha-noi` |
| Brand + province | Shop Toyota tại Hà Nội | `{ brand, provinceSlug }` | `/shops?brand=Toyota&province=ha-noi` |

**Excluded:** category, model, year (directory API scope per Phase 3A).

**Province source:** `deriveSelectedCityFromLocation(location, availableLocations)?.slug` — no backend change.

---

## Navigation flow

| Action | Destination |
|--------|-------------|
| Tap shop row | `buildShopStorefrontUrl(slug)` (same as desktop rail) |
| **Xem tất cả Shop →** | `context.directoryHref` → `/shops` with query |
| Guest: Đăng nhập Shop | `/shop/login` |
| Guest: Đăng ký Shop | `/shop/register` |
| Seller: Quản lý sản phẩm | `/shop/products` |
| Seller: Hộp thư RFQ | `/rfq/shop/inbox` |
| Seller: Cài đặt Shop | `/shop/settings` |

Shop card uses `<a href>` storefront URL — no new `router.push` from Home filter logic.

---

## Province integration

When marketplace **location** filter is set and resolves via `availableLocations`:

- `provinceSlug` passed to `GET /api/public/shops?provinceSlug=…` (existing API param)
- Directory link uses `?province=` (matches `/shops` page convention)
- Desktop rail now also benefits from province filter (enhancement over brand-only)

---

## Desktop regression

| Check | Status |
|-------|--------|
| Heading | ✓ **SHOP PHÙ HỢP** (desktop variant) |
| Card layout / classes | ✓ `of-shop-rec__*` unchanged |
| Link text | ✓ **Xem thêm →** |
| Datasource | ✓ Same API |
| Brand-only behavior | ✓ Same query as before |
| Province when location set | ✓ New passthrough (3B enhancement) |

---

## Regression checklist

| Check | Status |
|-------|--------|
| `npm run build` | ✓ **PASS** |
| `/` First Load JS | **157 kB** (Δ +1 kB vs Phase 2 — within ≤2 kB) |
| Same datasource | ✓ `GET /api/public/shops` only |
| Same request count | ✓ Shared `fetchJsonCached` key per query |
| No additional API/SQL | ✓ |
| Search / Discovery / SEO | ✓ Untouched |
| Brand filter | ✓ `query.brand` |
| Province filter | ✓ `query.provinceSlug` |
| Guest / seller links | ✓ Existing routes |

---

## Build result

```
✓ Compiled successfully (Next.js 15.5.15)
Route /  First Load JS 157 kB
Exit code: 0
```

---

## Manual verification

- [ ] Mobile: tap **Shop** → BottomSheet (not `/shop/login`)
- [ ] Header title changes with brand/location filters
- [ ] Shop list loads (5 shops max)
- [ ] Tap shop → storefront subdomain
- [ ] **Xem tất cả Shop →** → `/shops` with correct query
- [ ] Guest sees Đăng nhập / Đăng ký
- [ ] Logged-in seller sees Quản lý sản phẩm / RFQ / Cài đặt
- [ ] Desktop right rail **SHOP PHÙ HỢP** unchanged visually
- [ ] Set Toyota + Hà Nội → title **Shop Toyota tại Hà Nội**

---

## Phase 3C (out of scope)

- Directory `category` filter
- Deep link to filtered storefront collection
- Category/model/year in shop matching

---

**Phase 3B complete.**
