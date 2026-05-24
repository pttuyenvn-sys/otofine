# Shop Public Page — Phase 2 implementation result

> Status: shipped behind `PUBLIC_SHOPSITE_ENABLED=true` on apex, no subdomain rollout yet. See `audit/shop-public-pages-overview.md` for the multi-phase plan.

---

## 1. Migration 040 — `shops` additive

File: `backend/migrations/040_shops_public_site.sql` (idempotent via `INFORMATION_SCHEMA`).

```
$ npm run migrate:shopsite
[migrate:shopsite] OK: …/040_shops_public_site.sql

$ mysql> SHOW COLUMNS FROM shops;
+--------------------+-----------------------------------------+
| Field              | Notes                                   |
+--------------------+-----------------------------------------+
| slug               | NEW · varchar(63) UNIQUE                |
| public_status      | NEW · enum('pending','public','suspended') DEFAULT 'pending' |
| bio                | NEW · varchar(255)                      |
| intro_html         | NEW · longtext                          |
| cover_image        | NEW · varchar(500)  (fallback: `cover`) |
| facebook_url       | NEW · varchar(255)                      |
| zalo_phone         | NEW · varchar(50)   (fallback: `zalo`)  |
| working_hours      | NEW · varchar(255)                      |
| lat                | NEW · decimal(10,7)                     |
| lng                | NEW · decimal(10,7)                     |
| map_embed_url      | NEW · varchar(500)                      |
| verified_at        | NEW · datetime                          |
| published_at       | NEW · datetime                          |
+--------------------+-----------------------------------------+
NEW INDEXES: idx_shops_slug (UNIQUE), idx_shops_slug_status
```

`avatar`, `cover`, `zalo`, `descriptionHtml`, `addressDetail`, `email`, `website`, `phone`, `provinceId/districtId/wardId` were already present and are reused — nothing renamed, dropped, or retyped. Products schema untouched.

---

## 2. Backend module — `backend/domains/shopPublic/`

```
backend/domains/shopPublic/
├── config/
│   └── publicShop.config.js           # lazy getters: enabled, listPageSize, RESERVED_SHOP_SLUGS, SLUG_REGEX
├── utils/
│   └── slug.util.js                   # slugify(), isValidShopSlug(), normalizeSlugParam()
├── repositories/
│   ├── shopPublic.repository.js       # findPublicShopBySlug + categories + product count
│   └── shopPublicProducts.repository.js  # read-only paginated products by shopId
├── services/
│   └── shopPublic.service.js          # DTO projection + fallback handling
├── validators/
│   └── shopPublic.validators.js       # slug param + products query whitelist
├── middlewares/
│   └── enabled.middleware.js          # second 404 gate
├── controllers/
│   └── shopPublic.controller.js       # 4 GET handlers
└── index.js                           # barrel
```

Mount point — `backend/server.js`:

```
if (publicShopConfig.enabled) {
  app.use("/api/public/shops", publicShopRoutes);
  console.info("[publicShop] routes mounted at /api/public/shops");
}
```

Flag is read at boot AND inside the router (`publicShopsiteEnabledOrNotFound`). With `PUBLIC_SHOPSITE_ENABLED=false`, both layers return 404 — externally indistinguishable from "URL doesn't exist".

---

## 3. Slug rules

- regex: `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`  (3–40 chars, DNS-safe, no leading/trailing dash)
- reserved list: `www, api, admin, rfq, shop, shops, app, assets, cdn, mail, static, img, rfq-img, m, mobile, account, auth, seller, support, help, docs, blog, status, staging, dev, qa, test`
- `slugify("Cửa Hàng Ô Tô 355", { compact: true })` → `"cuahangoto355"` (matches the spec example)
- Validation rejects every other shape before DB hits.

---

## 4. Public endpoints

All gated, all `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

### `GET /api/public/shops/cuahangoto355`
```
{
  "id": 2,
  "slug": "cuahangoto355",
  "name": "Phụ tùng ô tô 355",
  "shortDescription": "Chuyên phụ tùng - đồ chơi - chăm sóc ô tô chính hãng",
  "verified": true,
  "avatar": null,
  "cover": "https://images.unsplash.com/photo-1503376780353-…",
  "phone": "0847770777",
  "zalo":  "0965 123 456",
  "email": "otofine2112@gmail.com",
  "facebook": { "label": "facebook.com/cuahangoto355", "url": "https://facebook.com/cuahangoto355" },
  "website": "https://www.otofine.com/phutungoto355/",
  "address": "355 Trần Khát chân",
  "province": "TP Hà Nội",
  "workingHoursShort": "08:00 - 18:00 (Thứ 2 - Thứ 7) | Chủ nhật: 08:00 - 12:00",
  "workingHoursLines": ["08:00 - 18:00 (Thứ 2 - Thứ 7)", "Chủ nhật: 08:00 - 12:00"],
  "introHtml": "<p>Cửa hàng ô tô 355 là đại lý phụ tùng ô tô uy tín tại Hà Nội…",
  "salePolicyHtml": "…",
  "warrantyPolicyHtml": "…",
  "lat": null, "lng": null, "mapEmbedUrl": null,
  "verifiedAt":  "2026-05-24T08:01:50.000Z",
  "publishedAt": "2026-05-24T08:01:50.000Z",
  "createdAt":   "…",
  "productCount": 2806
}
```

### `GET /api/public/shops/cuahangoto355/products?perPage=3&sort=newest`
```
{
  "shop": { "id": 2, "slug": "cuahangoto355", "name": "Phụ tùng ô tô 355" },
  "items": [
    { "id": 2913, "productId": 2913, "name": "Van điều khiển turbo",
      "partNumber": "9830683680", "price": 1650000,
      "image": "https://img.otofine.com/shops/2/9830683680.webp",
      "category": "Van Điều Khiển Turbo", "brand": "Peugeot" },
    …
  ],
  "page": 1, "perPage": 3, "total": 2806, "totalPages": 936
}
```

Whitelisted query params: `page, perPage (≤60), q, category, brand, model, sort=newest|price_asc|price_desc`.

### `GET /api/public/shops/cuahangoto355/categories`
```
{ "items": [
    { "id": 59281, "name": "Cản Trước", "slug": null, "productCount": 47 },
    { "id": 59280, "name": "Má Phanh Trước", "slug": null, "productCount": 41 },
    …
] }
```

### `GET /api/public/shops/cuahangoto355/contact`
Returns the contact-only projection of the shop DTO (no policies, no intro html).

### Fallbacks (all return HTTP 404, identical body)
| Case | HTTP | Body |
|------|------|------|
| Unknown slug `/nonexistent` | 404 | `{"error":"Shop không tồn tại"}` |
| Reserved slug `/admin`     | 404 | (default Express body) |
| Invalid slug `/AAA!`       | 404 | (no DB hit; validator rejected) |
| Shop exists, `public_status != 'public'` (e.g. `autopt`) | 404 | `{"error":"Shop không tồn tại"}` |

Enumeration is prevented — every failure mode returns the same status and shape.

---

## 5. Frontend

```
frontend/services/shopPublic.service.js
frontend/app/(shopsite)/
├── layout.js                          # outer wrapper only (background + container)
├── shop-demo/                         # KEPT for compare/debug (Phase 1 hardcoded)
│   ├── layout.js                      # NEW — header + tabs for the demo
│   └── page.js, san-pham/, gioi-thieu/, lien-he/
└── shops/[slug]/                      # NEW Phase 2 — DB-backed
    ├── layout.js                      # SSR fetch + ShopHeader + ShopTabs(basePath)
    ├── page.js                        # home
    ├── san-pham/page.js               # products list + filters + pagination
    ├── gioi-thieu/page.js             # about (DB intro_html)
    └── lien-he/page.js                # contact + map
```

`ShopTabs` and `ShopSidebar` were updated with a `basePath` prop so the same code drives both `/shop-demo/*` (hardcoded demo) and `/shops/<slug>/*` (DB-backed).

`AppShell.jsx` now also matches `pathname.startsWith("/shops/")` in its hide-shell logic so the seller-center chrome doesn't bleed in.

Build output:
```
ƒ /shops/[slug]                         123 B    104 kB
ƒ /shops/[slug]/gioi-thieu              188 B    102 kB
ƒ /shops/[slug]/lien-he                 188 B    102 kB
ƒ /shops/[slug]/san-pham                123 B    104 kB
○ /shop-demo                            122 B    104 kB   (Phase 1 still static)
○ /shop-demo/gioi-thieu                 188 B    102 kB
○ /shop-demo/lien-he                    188 B    102 kB
○ /shop-demo/san-pham                   123 B    104 kB
```

---

## 6. Product detail links

`ShopProductCard` links to `/product/[id]` (relative). On the apex this resolves to the canonical product detail page (`https://otofine.com/product/123`). No product detail rebuild — direct reuse.

---

## 7. SEO (Phase 2 scope)

`generateMetadata({ params })` in `app/(shopsite)/shops/[slug]/layout.js`:
```
title: `${shop.name} — Phụ tùng ô tô | Otofine`
description: shop.shortDescription || `Phụ tùng ô tô — ${shop.name}`
robots: { index: false, follow: false }   // deferred until subdomain go-live
```
No dynamic robots, no dynamic sitemap, no canonical injection yet — matches the brief.

---

## 8. Smoke-test summary

Frontend (localhost:3000):

| Route                                | HTTP |
|--------------------------------------|------|
| `/shops/cuahangoto355`               | 200  |
| `/shops/cuahangoto355/san-pham`      | 200  |
| `/shops/cuahangoto355/gioi-thieu`    | 200  |
| `/shops/cuahangoto355/lien-he`       | 200  |
| `/shops/unknown-shop` (fallback)     | 404  |
| `/shop-demo` (Phase 1 regression)    | 200  |

Apex regression:

| Route               | HTTP |
|---------------------|------|
| `/`                 | 200  |
| `/shop/login`       | 200  |
| `/product/2913`     | 200  |
| `/rfq/open`         | 200  |
| `/phu-tung-o-to`    | 200  |

Backend (`/api/products`) byte-diff with and without `?shopId=2` → identical. Existing `/api/shop/me` still rejects unauthenticated traffic with 401.

Screenshots in `audit/screenshots/phase2/{home,products,about,contact}-{desktop,mobile}.png`.

---

## 9. Fallback when a shop is NOT published

| Layer | Behaviour |
|-------|-----------|
| `findPublicShopBySlug(slug)` | `WHERE slug = ? AND public_status = 'public'` — non-public rows return NULL |
| Service | Maps NULL → returns NULL to controller |
| Controller | Returns HTTP 404 with `{"error":"Shop không tồn tại"}` |
| Frontend `layout.js` | `await fetchPublicShop(slug)` → null → `notFound()` from `next/navigation` |
| Browser | Sees Next.js' default 404 page |

The same path also handles: deleted shops, suspended shops (`public_status='suspended'`), reserved slugs hitting the validator, and slugs that fail the regex. No leak of "this slug exists but isn't published".

---

## 10. Backfill helper

`backend/scripts/backfill-shop-public-demo.js` (idempotent, uses `COALESCE` so re-runs never overwrite real data):

```
$ node scripts/backfill-shop-public-demo.js --id 2 --slug cuahangoto355
Backfilling shop id=2 (Phụ tùng ô tô 355) → slug='cuahangoto355'
Done: {
  id: 2,
  name: 'Phụ tùng ô tô 355',
  slug: 'cuahangoto355',
  public_status: 'public',
  published_at: 2026-05-24T08:01:50.000Z,
  verified_at:  2026-05-24T08:01:50.000Z
}
```

---

## 11. What's still OFF (per brief)

- `app/[slug]`, `app/product`, RFQ, auth, `middleware.js`, Nginx, apex routing — untouched.
- No wildcard DNS, no subdomain TLS, no host-aware middleware, no dynamic robots/sitemap.
- Hardcoded `/shop-demo` UI kept alongside `/shops/[slug]` for visual diffing.

Next phase (Phase 3): wildcard DNS + subdomain middleware + canonical/robots/sitemap per `audit/shop-public-rollout-plan.md`.
