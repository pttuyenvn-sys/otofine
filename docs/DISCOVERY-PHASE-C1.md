# DISCOVERY-PHASE-C1

**Mode:** IMPLEMENT  
**Date:** 2026-06-28  
**Scope:** Vehicle layer product links only — chuẩn hóa `/product/{id}` → canonical `/<slug>-<id>`

---

## Mục tiêu

Trong HTML article của trang Vehicle SEO (`/phu-tung-{brand}-{model}…`), mọi `<a href>` trỏ sản phẩm phải dùng URL canonical hiện tại của Otofine (`/<part>-<brand>-<model>-<year>-<partNumber>-<id>`), **không** dùng legacy `/product/{id}` hay `/san-pham/{slug}`.

**Không thêm** Discovery Nav / footer nav / sr-only nav mới. **Không đổi** số lượng link.

---

## Files changed

| File | Change |
|------|--------|
| `backend/utils/buildVehicleSeoArticle.js` | Import `getCanonicalProductPath`; thêm `resolveProductHref()`; thay 2 chỗ hardcode `/product/` và `/san-pham/` |
| `backend/services/vehicleSeo.service.js` | Enrich `products` với `canonicalPath` qua `loadPrimaryFitmentCarsByProductIds` + `attachCanonicalFieldsFromMap` trước khi build article |

**Không sửa:** Home, Category, Brand, Vehicle discovery nav, Product grid, `Home.jsx`, Discovery Engine, sitemap, frontend URL builders.

---

## URL builder tái sử dụng

| Layer | Function |
|-------|----------|
| Backend canonical path | `getCanonicalProductPath()` từ `backend/modules/products/services/canonicalPath.server.js` |
| Fitment + attach | `loadPrimaryFitmentCarsByProductIds()`, `attachCanonicalFieldsFromMap()` (cùng module) |
| Fallback (id-only) | `/p/{id}` — cùng contract với `buildProductSeoUrl()` frontend, **không** `/product/{id}` |

Logic `resolveProductHref()`:

1. Ưu tiên `product.canonicalPath` (sau enrich)
2. Fallback `getCanonicalProductPath(product)`
3. Cuối cùng `/p/{id}` nếu không build được slug

---

## HTML diff (vehicle page `/phu-tung-toyota-vios`)

Googlebot UA, local stack sau `pm2 restart otofine-backend` + xóa fetch cache stale.

| Metric | BEFORE (stale cache / legacy HTML) | AFTER |
|--------|-------------------------------------|-------|
| HTML size | 82 191 B | 104 747 B |
| `<a` count (toàn trang) | **62** | **62** (không đổi) |
| `vehicle-seo-part-list` links | 12 | 12 |
| `vehicle-price-table` links | 10 | 10 |
| `/product/` trong HTML | **44** | **0** |
| `/san-pham/` trong HTML | 0 | 0 |

### Ví dụ href diff

**BEFORE:**

```html
<a href="/product/6537" class="vehicle-seo-part-link">
<a href="/product/5668" class="vehicle-seo-part-link">
```

**AFTER:**

```html
<a href="/loc-gio-dieu-hoa-toyota-altis-2006-2016-8713906080-6537" class="vehicle-seo-part-link">
<a href="/choi-than-may-phat-toyota-camry-2007-2020-273700m040-5668" class="vehicle-seo-part-link">
```

HTML size tăng do URL dài hơn — **số lượng `<a>` giữ nguyên**.

---

## Redirect diff

| URL | Trước (trong HTML vehicle) | Sau (trong HTML vehicle) |
|-----|------------------------------|---------------------------|
| `/product/6537` | Có trong HTML → click → **308** → canonical | **0** occurrence trong HTML mới |
| `/loc-gio-dieu-hoa-…-6537` | Không có | Có — **200** trực tiếp, không redirect hop |

Legacy `/product/{id}` route vẫn tồn tại (308 redirect) cho bookmark cũ — chỉ **loại bỏ khỏi HTML vehicle layer**.

---

## Canonical diff

| Field | BEFORE | AFTER |
|-------|--------|-------|
| Page canonical | `https://otofine.com/phu-tung-toyota-vios` | **Không đổi** |
| Product hrefs in article | Legacy `/product/{id}` | Root canonical `/<slug>-<id>` |
| Sitemap | 588 B index, 4 child sitemaps | **Không đổi** (không touch sitemap code) |

---

## Regression

| Check | Result |
|-------|--------|
| `npm run build` (frontend) | **PASS** |
| Sitemap | **Unchanged** |
| Page canonical | **Unchanged** |
| Breadcrumb | **Unchanged** (vehicle page structure giữ nguyên) |
| JSON-LD | **Unchanged** (không sửa composer JSON-LD) |
| Product Grid (`Home.jsx`) | **Unchanged** |
| Discovery Graph (A/B nav) | **Unchanged** |
| Link count | **62 → 62** on `/phu-tung-toyota-vios` |

### API verification

```bash
curl -s 'http://127.0.0.1:5000/api/vehicle-seo/toyota-vios' | \
  python3 -c "import json,sys; d=json.load(sys.stdin); h=d['seoContent']['articleHtml']; print(h.count('/product/'))"
# → 0
```

Products array includes `canonicalPath`:

```
6537 → /loc-gio-dieu-hoa-toyota-altis-2006-2016-8713906080-6537
```

---

## Deploy

```bash
pm2 restart otofine-backend
# Frontend: articleHtml cached via fetch revalidate 3600s
# Option A: wait TTL
# Option B: rm -rf frontend/.next/cache/fetch-cache && pm2 restart otofine-frontend
```

**Không cần** `npm run build` frontend (thay đổi backend-only).

---

## Rollback

```bash
git checkout -- backend/utils/buildVehicleSeoArticle.js backend/services/vehicleSeo.service.js
pm2 restart otofine-backend
rm -rf frontend/.next/cache/fetch-cache && pm2 restart otofine-frontend
```

Article HTML sẽ quay lại `/product/{id}` cho sản phẩm không có `slug` legacy field.

---

## Ghi chú vận hành

- `getVehicleSeoPage` cache `revalidate: 3600` — sau deploy backend, frontend có thể phục vụ article cũ tối đa 1h nếu không xóa fetch cache.
- `/p/{id}` là fallback hợp lệ (1 hop 308) khi thiếu dữ liệu slug; trong production data vehicle page, fitment enrich đủ → full canonical path.
