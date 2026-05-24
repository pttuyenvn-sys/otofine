# Shop Public Page — Phase 4 Implementation Result

**Scope:** Seller Config Panel + Shopsite SEO Cleanup
**Status:** ✅ Complete
**Commit:** `feat(shopsite): add seller public storefront management`

---

## Goals

1. **Shop tự quản lý public storefront** — sellers can configure slug,
   branding, intro, contact, and publish status without admin help.
2. **Chuẩn hóa SEO / canonical** — exactly one canonical per page, apex
   for product pages, self for subdomain pages, no duplicate surface.
3. **Chưa bật Google indexing** — all subdomain pages still
   `noindex, nofollow` (Phase 5 flips it on).
4. **Không phá seller center cũ** — `/shop/settings`, `/shop/products`,
   `/shop/add-product`, RFQ, auth, products APIs all untouched.

---

## 1. Seller Config Panel

**Route:** `/shop/public-page` (gated by existing `ShopGuard`,
reuses existing `Sidebar` + `Topbar`, no redesign of seller center).

Sidebar additions: one new menu item `🌐 Public Page` after
`Add Product` in `frontend/components/Sidebar.jsx`. Nothing else
moved.

**Sections (1 → 4 on the form):**

| # | Section          | Fields                                                                                          |
|---|------------------|-------------------------------------------------------------------------------------------------|
| 1 | Trang public     | `Trạng thái` (draft/public/suspended), `Slug` (realtime validated), `Preview` (sub + apex link) |
| 2 | Branding         | `Avatar`, `Ảnh bìa (cover)`, `Giới thiệu ngắn (bio)` (max 255)                                  |
| 3 | Giới thiệu       | Rich-text `Intro HTML` (Quill, sanitized server-side)                                           |
| 4 | Liên hệ          | Zalo, Facebook URL, Địa chỉ, Giờ làm việc, Map embed URL                                        |

The bottom of the form has a **sticky save bar** so "Lưu thay đổi"
is always reachable on long pages, even on mobile.

**Screenshots:** `audit/screenshots/phase4/seller-config-*.png`
(desktop 1366×900 + mobile 390×844)

```
seller-config-{desktop,mobile}.png         section 1: Trang public
seller-config-mid-{desktop,mobile}.png     section 2: Branding
seller-config-bottom-{desktop,mobile}.png  sections 3 & 4: Intro + Contact
seller-config-full-{desktop,mobile}.png    full-page capture
```

---

## 2. Slug rules

Enforced at three layers:

| Layer       | File                                                                  | Check                                                                |
|-------------|-----------------------------------------------------------------------|----------------------------------------------------------------------|
| Frontend    | `frontend/components/pages/ShopPublicPage.jsx` (`useSlugStatus`)      | Debounced realtime call to `/api/shop/public-page/check-slug`        |
| Backend     | `backend/domains/shopPublic/validators/sellerPublicPage.validators.js`| Reserved set + lower/no-unicode/no-space regex                       |
| Storage     | `shops.idx_shops_slug` unique key (migration 040)                     | DB-level uniqueness — last line of defense                           |

Rules:

- **lowercase only** — UI lowercases on every keystroke; server
  rejects mixed case as `INVALID`.
- **no unicode, no spaces** — regex `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$`.
- **reserved validation** — see `RESERVED_SHOP_SLUGS` in
  `backend/domains/shopPublic/config/publicShop.config.js` (api,
  admin, www, shop, shops, rfq, mail, assets, cdn, app, …).
- **unique validation realtime** — debounced 350 ms, returns
  `{ available, mine }` so the UI can distinguish "this is my own
  slug" from "available for me to claim".

The PUT endpoint refuses to **update** a slug into a reserved or
already-taken value, returning a structured error:

```json
{ "ok": false, "errors": [{ "field": "slug", "message": "...", "code": "TAKEN" }] }
```

### Realtime validation — observed responses

```
$ curl /api/shop/public-page/check-slug?slug=cuahangoto355
{"available":true,"ok":true,"slug":"cuahangoto355","mine":true}

$ curl /api/shop/public-page/check-slug?slug=api
{"available":false,"ok":false,"code":"RESERVED","error":"Slug này đã được hệ thống dành riêng"}

$ curl /api/shop/public-page/check-slug?slug=NO_GOOD
{"available":false,"ok":false,"code":"INVALID","error":"Slug chỉ chấp nhận chữ thường, số và dấu gạch (3-40 ký tự)"}

$ curl /api/shop/public-page/check-slug?slug=test-shop-abc123
{"available":true,"ok":true,"slug":"test-shop-abc123","mine":false}
```

---

## 3. Image upload

Reuses the existing R2 client (`backend/utils/r2-sdk.js`) — **no new
bucket, no new credentials, no new SDK**. Two new endpoints:

| Endpoint                                  | R2 key pattern                          |
|-------------------------------------------|-----------------------------------------|
| `POST /api/shop/public-page/upload-avatar`| `shop-public/avatar/<shopId>.<ext>`     |
| `POST /api/shop/public-page/upload-cover` | `shop-public/cover/<shopId>.<ext>`      |

Both go through:

1. `enabled-gate` (PUBLIC_SHOPSITE_ENABLED kill switch)
2. `requireAuth` + `requireShop` (ownership)
3. `publicPageUploadRateLimit` (12 / min / shop, in-memory token bucket)
4. `multer.memoryStorage()` with `{ fileSize: 6 MB, files: 1 }`
5. `validateUploadFile()` — MIME allowlist (png/jpg/webp), 5 MB hard cap

On success the URL goes straight into `shops.avatar` /
`shops.cover_image`. Old `shops.cover` column stays untouched
(public read API falls back to it via `COALESCE`).

---

## 4. Public status

| Status      | DB value  | Subdomain effect                        |
|-------------|-----------|------------------------------------------|
| `draft`     | `pending` | `404` via `notFound()` in tenant layout |
| `public`    | `public`  | Visible storefront                       |
| `suspended` | `suspended` | Hidden — same 404 path                 |

`draft ↔ pending` aliasing lives entirely in
`validators/sellerPublicPage.validators.js` (`toDbStatus` /
`fromDbStatus`). The DB enum stays the same — no migration churn.

First-time publish stamps `shops.published_at` to `NOW()`.
Subsequent publishes preserve the original timestamp
(`COALESCE(published_at, NOW())`).

---

## 5. DB row example (live)

```text
+--------------+--------------------------------------------------+
| id           | 2                                                |
| name         | Phụ tùng ô tô 355                                |
| slug         | cuahangoto355                                    |
| public_status| public                                           |
| bio          | Chuyên phụ tùng - đồ chơi - chăm sóc ô tô...    |
| intro_html   | <p>Cửa hàng ô tô 355 là đại lý phụ tùng…</p>... |
| avatar       | NULL  (seller hasn't uploaded an avatar yet)    |
| cover_image  | https://images.unsplash.com/...                  |
| zalo_phone   | 0965 123 456                                     |
| facebook_url | https://facebook.com/cuahangoto355               |
| working_hours| 08:00 - 18:00 (Thứ 2 - Thứ 7) | Chủ nhật...     |
| map_embed_url| https://www.google.com/maps/embed?pb=...         |
| addressDetail| 355 Trần Khát chân                               |
| verified_at  | 2026-05-24 15:01:50                              |
| published_at | 2026-05-24 15:01:50                              |
+--------------+--------------------------------------------------+
```

---

## 6. Frontend shopsite cleanup

### Product card → absolute apex URL

`frontend/components/shopsite/ShopProductCard.jsx` now imports
`apexProductUrl` from `frontend/lib/apexOrigin.js` and emits
`https://otofine.com/product/<id>` instead of `/product/<id>`.

`apexOrigin.js` resolves origin from (in order):
`NEXT_PUBLIC_APEX_URL` → `NEXT_PUBLIC_SITE_URL` → `https://otofine.com`.

**Verified at runtime (curl from local dev server):**

```text
$ curl -H "Host: cuahangoto355.localhost:3000" :3000/san-pham | grep -oE 'href="[^"]*product/[0-9]+"' | head -3
href="https://otofine.com/product/2913"
href="https://otofine.com/product/2912"
href="https://otofine.com/product/2911"

$ curl :3000/shops/cuahangoto355/san-pham | grep -oE 'href="[^"]*product/[0-9]+"' | head -3
href="https://otofine.com/product/2913"
href="https://otofine.com/product/2912"
href="https://otofine.com/product/2911"
```

Both subdomain AND apex `/shops/<slug>` paths emit the same absolute
apex URL — no relative `/product/...` survives in the storefront.

---

## 7. Canonical contract

| URL                                              | `<link rel="canonical">`                          | `<meta name="robots">` |
|--------------------------------------------------|---------------------------------------------------|------------------------|
| `https://otofine.com/`                           | `https://otofine.com`                             | `index, follow`        |
| `https://otofine.com/product/2913`               | `https://otofine.com/product/2913`                | `index, follow`        |
| `https://otofine.com/shops/cuahangoto355`        | `https://otofine.com/shops/cuahangoto355`         | `noindex, nofollow`    |
| `https://cuahangoto355.otofine.com/`             | `https://cuahangoto355.otofine.com/`              | `noindex, nofollow`    |
| `https://cuahangoto355.otofine.com/san-pham`     | `https://cuahangoto355.otofine.com/san-pham`      | `noindex, nofollow`    |
| `https://cuahangoto355.otofine.com/gioi-thieu`   | `https://cuahangoto355.otofine.com/gioi-thieu`    | `noindex, nofollow`    |
| `https://cuahangoto355.otofine.com/lien-he`      | `https://cuahangoto355.otofine.com/lien-he`       | `noindex, nofollow`    |

**Live verification (curl on dev server):**

```text
$ curl -H "Host: cuahangoto355.localhost:3000" :3000/        | grep canonical
<link rel="canonical" href="http://cuahangoto355.localhost"/>

$ curl -H "Host: cuahangoto355.localhost:3000" :3000/san-pham| grep canonical
<link rel="canonical" href="http://cuahangoto355.localhost/san-pham"/>

$ curl :3000/                                                | grep canonical
<link rel="canonical" href="https://otofine.com"/>

$ curl :3000/product/2913                                    | grep canonical
<link rel="canonical" href="https://otofine.com/product/2913"/>
```

Each page emits **exactly one** canonical. Apex `/product/*` and apex
`/` are untouched. Product canonicals continue to point to apex (we
did not touch `app/product`).

Implementation: `getShopCanonicalUrl(slug, subPath)` in
`frontend/services/shopPublic.service.js`. It reads `host` +
`x-forwarded-proto` from `next/headers` and decides
subdomain-self vs apex-canonical at render time. Each of the four
`/shops/[slug]/*` pages has its own `generateMetadata` that wires
this in — the layout's metadata acts as fallback for `title` and
`description` only.

---

## 8. Noindex (still on)

Phase 4 keeps `robots: { index: false, follow: false }` on **every**
subdomain page and every apex `/shops/<slug>` page. The
self-canonical is pre-wired now so when Phase 5 flips
`index: true`, the canonical surface is already correct — zero SEO
churn at flip time.

---

## 9. Shop header polish (no full redesign)

`frontend/components/shopsite/ShopHeader.jsx`:

- **Cover gradient overlay** — adds a deeper bottom-up gradient
  (`from-black/85`) plus a radial fade at the bottom-left so the
  avatar+name area stays legible regardless of cover image content.
- **Verified badge** — replaced the red circle-check with a small
  blue gradient pill: `[✓] Đã xác minh`. Adds a `title` tooltip,
  ring-1 white/30 border for contrast, scales properly on mobile.
- **CTAs** — Zalo (white) + Call (red) now share `hover:bg-*`,
  `active:scale-[0.98]`, `focus-visible:ring`, and `shadow-md`.
  On mobile they `flex-1` to occupy the full row width.
- **Avatar** — `border-[3px] border-white` + `ring-2 ring-white/10`
  + `shadow-xl` for a softer, layered look.
- **Cover aspect** — bumped mobile from `aspect-[16/6]` → `[16/7]`
  so the avatar doesn't crowd the bottom edge on narrow viewports.

`frontend/components/shopsite/ShopTabs.jsx`:

- **Sticky** — `sticky top-0 z-30` keeps tabs in view as the user
  scrolls the storefront. Uses `bg-white/95` +
  `supports-[backdrop-filter]:bg-white/80 supports-[backdrop-filter]:backdrop-blur`
  so Safari < 14 gracefully degrades to opaque white.
- **Underline animation** — the active indicator is now always
  rendered with `scale-x-0/100 + transition-transform` so tab
  switches feel smoother than a hard show/hide.
- **Focus ring** — added `focus-visible:ring-2 ring-[#e60012]/40`
  for keyboard accessibility.

No DOM shape or routing changed. No new tabs.

---

## 10. Security

| Concern                         | Mitigation                                                                                                            |
|---------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| Seller editing someone else's shop | `requireAuth` + `requireShop` derives `req.shop.id` from JWT → DB lookup. The seller never sends `shopId`.        |
| XSS via intro_html              | `sanitizeShopHtml` in `backend/domains/shopPublic/utils/htmlSanitize.util.js` — allow-list tags + attrs, drops `<script>`, `<iframe>`, `<form>`, `<style>`, `<svg>`, `on*=` handlers, `javascript:` URLs; auto-adds `rel="noopener noreferrer"` on `target="_blank"` links. |
| Upload abuse — size             | Multer `fileSize: 6 MB` + handler-level 5 MB check (413 on overflow).                                                 |
| Upload abuse — MIME             | Allow-list `image/png`, `image/jpeg`, `image/jpg`, `image/webp` (400 on anything else).                               |
| Upload abuse — rate             | `publicPageUploadRateLimit`: 12 uploads / min / shop, in-memory token bucket (mirrors `loginRateLimit.middleware.js`). |
| URL injection                   | Facebook + Map URL fields validated to require `https://` prefix.                                                     |
| Slug squatting                  | Reserved-list check + uniqueness check at the validator AND DB unique index.                                          |

### XSS sanitizer — observed behaviour

Input:

```html
<p>Hello <script>alert(1)</script><strong>world</strong></p>
<a href="javascript:bad()">click</a>
<a href="https://example.com" target="_blank">ok</a>
<iframe src="http://evil"></iframe>
```

Output stored in DB:

```html
<p>Hello <strong>world</strong></p>
<a>click</a>
<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>
```

→ script stripped, iframe stripped, `javascript:` URL stripped to
attribute-less `<a>`, `target="_blank"` auto-gained
`rel="noopener noreferrer"`.

---

## 11. PATCH semantics bug found + fixed

During smoke-testing the initial repository version had a latent
PUT-overwrite bug: any field NOT included in the request body was
written to `NULL` (the static SQL bound `?` to `data.field ?? null`
unconditionally).

Fix: `updatePublicPageConfig` now uses a dynamic `SET` builder that
only includes columns the caller explicitly sent. Contract:

- key missing → column untouched
- key === null → column explicitly cleared
- key === value → column overwritten

Regression test (live, against running backend):

```text
Before: bio="Chuyên phụ tùng...", facebook_url=NULL
PUT only { "bio": "PATCH-TEST" }
After:  bio="PATCH-TEST",  facebook_url=NULL  ✓ unchanged
```

---

## 12. Publish flow

```
┌─────────────────────────┐
│ Seller opens            │
│ /shop/public-page       │
└──────────┬──────────────┘
           │  GET /api/shop/public-page  (JWT)
           ▼
┌─────────────────────────┐
│ Form populates with     │
│ existing slug, status,  │
│ branding, intro, contact│
└──────────┬──────────────┘
           │  user edits + clicks "Lưu thay đổi"
           ▼
┌─────────────────────────┐    ┌─────────────────────────────────┐
│ PUT /api/shop/public-   │───▶│ validators.buildUpdatePayload   │
│ page  (JSON body)       │    │ • slug → checkSlugAvailability  │
└─────────────────────────┘    │ • intro_html → sanitizeShopHtml │
                               │ • URLs → https:// required      │
                               │ • text → length capped          │
                               └─────────────┬───────────────────┘
                                             │ errors?
                                  ┌──────────┴──────────┐
                                  ▼                     ▼
                          400  errors[]           updatePublicPageConfig
                          {field, message,        (dynamic SET, only
                           code}                   provided columns)
                                                         │
                                                         │ status='public'
                                                         │ for the first
                                                         │ time?
                                                         ▼
                                                  published_at = NOW()
                                                         │
                                                         ▼
                                              200 { ok:true, data:{...} }
                                                         │
                                                         ▼
                                       Storefront immediately reflects:
                                         • cuahangoto355.otofine.com   visible
                                         • otofine.com/shops/...       visible
                                       Public READ API revalidate
                                       window (60s) refreshes apex SEO
                                       cache to match.
```

**Visibility matrix:**

| `public_status` | Subdomain HTTP    | Apex `/shops/<slug>` HTTP |
|-----------------|-------------------|---------------------------|
| `draft`         | 404 (via notFound)| 404                        |
| `public`        | 200               | 200                        |
| `suspended`     | 404               | 404                        |

(Subdomain `404` is served by `notFound()` from the layout because
the public READ repository returns `null` for any row whose
`public_status != 'public'`.)

---

## 13. Files changed

### Backend (new)
```
backend/domains/shopPublic/
  controllers/sellerPublicPage.controller.js
  middlewares/uploadRateLimit.middleware.js
  repositories/sellerPublicPage.repository.js
  services/sellerPublicPage.service.js
  utils/htmlSanitize.util.js
  validators/sellerPublicPage.validators.js
backend/routes/sellerPublicPage.routes.js
```

### Backend (edits)
```
backend/domains/shopPublic/index.js   ← new exports
backend/server.js                     ← mount /api/shop/public-page BEFORE /api/shop
```

### Frontend (new)
```
frontend/api/shopPublicPageApi.js
frontend/app/shop/public-page/page.js
frontend/components/pages/ShopPublicPage.jsx
frontend/lib/apexOrigin.js
```

### Frontend (edits)
```
frontend/components/Sidebar.jsx                                ← + Public Page link
frontend/components/shopsite/ShopHeader.jsx                    ← polish
frontend/components/shopsite/ShopProductCard.jsx               ← absolute apex href
frontend/components/shopsite/ShopTabs.jsx                      ← sticky + animation
frontend/services/shopPublic.service.js                        ← + getShopCanonicalUrl
frontend/app/(shopsite)/shops/[slug]/layout.js                 ← canonical fallback
frontend/app/(shopsite)/shops/[slug]/page.js                   ← per-page canonical
frontend/app/(shopsite)/shops/[slug]/san-pham/page.js          ← per-page canonical
frontend/app/(shopsite)/shops/[slug]/gioi-thieu/page.js        ← per-page canonical
frontend/app/(shopsite)/shops/[slug]/lien-he/page.js           ← per-page canonical
```

---

## 14. What this phase did NOT touch (verified)

- ❌ `frontend/app/[slug]`  (marketing single-segment pages)
- ❌ `frontend/app/product/[id]`  (product detail, with its own SEO)
- ❌ `frontend/app/rfq/**`
- ❌ `frontend/app/admin/**`
- ❌ `frontend/app/shop/{settings,products,add-product,...}`
- ❌ Auth: `frontend/components/pages/Shop{Login,Register,…}.jsx`
- ❌ Products APIs: `backend/routes/product.routes.js`,
       `backend/controllers/productController.js`
- ❌ Middleware routing logic in `frontend/middleware.js`
       (Phase 3 logic preserved as-is)
- ❌ Nginx config (`deploy/nginx/*` only contains the Phase 3 example)
- ❌ Apex SEO: `frontend/app/robots.js`, `frontend/app/sitemap.js`,
       `frontend/app/page.js`, `frontend/app/product/[id]/page.js`

Smoke test after restart:

```text
GET /                              200  index, follow,  canonical=https://otofine.com
GET /product/2913                  200  index, follow,  canonical=https://otofine.com/product/2913
GET /api/products                  200
GET /api/shop/me                   401  (apex seller settings — untouched)
GET /api/shop/public-page          401  (new endpoint — auth gate works)
GET /api/public/shops/cuahangoto355 200  (Phase 2 read API — untouched)
```

---

## 15. Phase 5 hooks (left ready, NOT enabled)

The following are wired but inert until Phase 5:

- Self-canonical URLs on every subdomain page — already correct.
  Flip `robots: { index: true, follow: true }` in
  `app/(shopsite)/shops/[slug]/layout.js` to enable indexing.
- `cover_image`, `avatar`, `bio` populated via the seller config
  drive the existing OG / Twitter meta paths (currently only
  `title` + `description`; extending to `og:image` is a 1-line
  change in the same `generateMetadata`).
- `published_at` is now correctly stamped → ready to feed a future
  `sitemap.xml` for shop subdomains.
