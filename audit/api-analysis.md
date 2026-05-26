# D. API Analysis — Otofine Backend

**Base URL:** `http(s)://host:5000/api` (production qua nginx)  
**Auth header:** `Authorization: Bearer <JWT>`  
**RFQ buyer tokens:** `x-rfq-viewer-token`, `x-rfq-history-token`

> RFQ routes chỉ mount khi `RFQ_MODULE_ENABLED=true` (mặc định **false** trong code).

---

## 1. Endpoint list (đầy đủ)

### Health & Root

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/` | Public | API alive message |
| GET | `/health`, `/api/health` | Public | Health check JSON |

### Auth (`/api/auth` và duplicate `/api/admin`)

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| POST | `/api/auth/shop-register` | Public | name, email, phone, password | `{ ok, shopId }` |
| POST | `/api/auth/shop-login` | Public | email, password | `{ token, shop: { id, accountId, name, email, status } }` |
| POST | `/api/auth/admin-login` | Public | email, password | `{ token, admin }` |
| POST | `/api/auth/admin-forgot-password` | Public | email | `{ newPassword }` ⚠️ |
| POST | `/api/admin/shop-login` | Public | (duplicate) | Same as auth |
| POST | `/api/admin/shop-register` | Public | (duplicate) | Same |
| POST | `/api/admin/admin-login` | Public | (duplicate) | Same |
| POST | `/api/admin/admin-forgot-password` | Public | (duplicate) | Same |

**Lưu ý:** `shopForgotPassword` có trong controller nhưng **không có route**.

### Admin Shops (`/api/admin`)

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/admin/shops` | Admin JWT | List shop_accounts (exclude deleted filter in SQL) |
| PATCH | `/api/admin/shops/:id/status` | Admin | active \| blocked |
| DELETE | `/api/admin/shops/:id` | Admin | Soft delete → status deleted ⚠️ |

### Shop profile (`/api/shop`, `/api/shops`)

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/shop/me` | Shop | Profile shops |
| POST | `/api/shop/` | Shop | Create shop profile |
| PUT | `/api/shop/me` | Shop | Update profile |
| POST | `/api/shop/upload-editor` | Shop | Rich text image upload |

### Products — Public listing

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/products` | Public | Listing (query normalized) |
| GET | `/api/product/:id` | Public | Product detail |
| GET | `/api/products/search` | Public | Search |
| GET | `/api/products/related` | Public | Related products |
| GET | `/api/products/card-list` | Public | Card list |
| GET | `/api/products/brands` | Public | Brands filter meta |
| GET | `/api/products/models` | Public | Models filter meta |
| GET | `/api/products/locations` | Public | Locations filter meta |

### Products — Shop seller

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/products/shop` | Shop | Shop's products |
| GET | `/api/products/shop/filters` | Shop | Filter metadata |
| GET | `/api/shop-filters` | Shop | Same (flat path) |
| GET | `/api/products/` | Shop | Products by shop (router) |
| POST | `/api/products/` | Shop | Create product |
| PUT | `/api/products/:id` | Shop | Update product |
| DELETE | `/api/products/:id` | Shop | Delete one |
| DELETE | `/api/products/` | Shop | Bulk delete |
| GET | `/api/products/filter` | Shop | Filter products |
| GET | `/api/products/:id/cars` | Shop | Car fitment |
| GET | `/api/products/car-info/:productId` | Mixed | Car info |
| POST | `/api/products/import` | Shop | Excel import |
| POST | `/api/products/import-images` | Shop | Image import |
| POST | `/api/products/images/import` | Shop | Alt path import images |
| GET | `/api/product-export/export` | Shop | Excel export |

### Categories & Filters

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/categories/popular` | Public |
| GET | `/api/filter/categories/popular` | Public |
| GET | `/api/filter/categories/` | Public |
| GET | `/api/filter/vehicle-hot` | Public |
| GET | `/api/filter/brands`, `/models`, `/years`, `/specs` | Public |
| GET | `/api/product-categories/` | Public |
| GET | `/api/product-categories/canonical` | Public |
| GET | `/api/product-categories/search` | Public |
| GET | `/api/product-categories/search-sidebar` | Public |
| GET | `/api/product-categories/slug/:slug` | Public |
| GET | `/api/category-seo/categories` | Public |
| GET | `/api/category-seo/:category` | Public |
| GET | `/api/category-seo/:category/metadata` | Public |
| GET | `/api/category-seo/:category/related` | Public |
| GET | `/api/category-seo/:category/faq` | Public |

### Cars & Address

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/car/brands`, `/models`, `/attributes` | Public |
| GET | `/api/car-models/brands`, `/` | Shop JWT |
| GET | `/api/address/provinces`, `/wards` | Public |
| GET | `/api/locations/available`, `/filtered` | Public |

### SEO & Knowledge

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/seo/sitemap-data` | Public |
| GET | `/api/seo-page/:slug` | Public |
| GET | `/api/vehicle-seo/:slug` | Public |
| GET | `/api/knowledge/part/:slug` | Public |
| GET | `/api/part-knowledge/` | Admin? / mixed |
| POST | `/api/part-knowledge/import-batch1` | Admin |
| GET/POST/PATCH/DELETE | `/api/part-knowledge/:id` | Admin CRUD |
| GET/POST/PATCH/DELETE | `/api/admin/part-knowledge/*` | Admin (re-mount) |

### Push & Integrations

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/push/save-player-id` | Public/Shop |
| POST | `/api/rfq-push/register` | Public |
| POST | `/api/rfq-push/register-history` | History token |
| POST | `/api/rfq-push/reminder-event` | Public |
| GET | `/api/zalo/webhook` | Public |
| POST | `/api/zalo/webhook` | Public |
| GET | `/api/zalo/oa/callback` | Public — returns token in JSON ⚠️ |
| GET | `/api/zalo/test-send` | Public — hardcoded user ⚠️ |

### Static

| Method | Path | Auth |
|--------|------|------|
| GET | `/uploads/*` | Public |

---

## 2. RFQ Module Endpoints (`RFQ_MODULE_ENABLED=true`)

### Public `/api/rfq`

| Method | Path | Auth | Rate limit |
|--------|------|------|------------|
| POST | `/api/rfq/create` | Public | Per IP/hour |
| POST | `/api/rfq/verify-otp` | Public | Per IP/hour |
| GET | `/api/rfq/by-token` | Viewer token | Per IP/min |
| POST | `/api/rfq/upload-image` | Public | 60/hour |

### History `/api/rfq/history`

| Method | Path | Auth |
|--------|------|------|
| POST | `/request-otp` | Public |
| POST | `/verify-otp` | Public |
| GET | `/summary` | x-rfq-history-token |
| GET | `/requests` | History token |
| GET | `/requests/:publicId` | History token |
| POST | `/requests/:publicId/open` | History token |
| POST | `/logout` | History token |

### Conversations `/api/rfq/conversations`

| Method | Path | Auth |
|--------|------|------|
| GET | `/unread-summary` | Buyer access |
| GET | `/:dispatchId` | Shop JWT or viewer |
| GET | `/:dispatchId/messages` | Same |
| POST | `/:dispatchId/messages` | Same |
| POST | `/:dispatchId/read` | Same |
| POST | `/:dispatchId/upload-image` | Same |

### Shop `/api/shop/rfq`

| Method | Path | Auth |
|--------|------|------|
| GET | `/inbox/summary` | Shop |
| GET | `/inbox` | Shop |
| PATCH | `/:dispatchId/view` | Shop |
| POST | `/:dispatchId/quote` | Shop |
| GET | `/:dispatchId` | Shop |

### Admin `/api/admin/rfq`

| Method | Path | Auth |
|--------|------|------|
| GET | `/health`, `/metrics`, `/reminder-metrics` | Admin |
| GET | `/analytics/funnel`, `/sellers`, `/ux` | Admin |
| POST | `/ops/replay-escalation/:dispatchId` | Admin |
| POST | `/ops/dispatch-append/:rfqRequestId` | Admin |
| POST | `/ops/spam/:rfqRequestId` | Admin |
| POST | `/ops/close/:rfqRequestId` | Admin |
| GET | `/ops/seller/:shopId/activity` | Admin |

---

## 3. API trùng lặp & naming

| Issue | Chi tiết |
|-------|----------|
| Auth duplicate | `/api/auth/*` ≡ `/api/admin/*` cho login/register |
| Shop filters triple | `/api/shop-filters`, `/api/products/shop/filters`, router paths |
| Products mount | 3 routers trên `/api/products` — thứ tự route quan trọng |
| Singular vs plural | `/api/product/:id` vs `/api/products/:id` |
| REST không chuẩn | `PATCH .../status`, `POST .../quote`, ops under `/ops/` |

---

## 4. API không dùng / nguy hiểm

| Endpoint | Lý do |
|----------|-------|
| `GET /api/zalo/test-send` | Hardcoded recipient, production risk |
| `GET /api/zalo/oa/callback` | Trả token ra response |
| `shopForgotPassword` handler | Không wired |
| `adminAuthController` | Dead file |
| Legacy Next `/api/seo/*` | HTTP 410 |

---

## 5. Response format patterns

- **Success:** `{ ...data }` hoặc array trực tiếp
- **Error:** `{ message }`, `{ error }`, RFQ: `{ code, message }` via `httpError.js`
- **Pagination:** query params qua `listingQueryNormalize.js` — không thống nhất REST cursor

---

## 6. Dependency graph (API layers)

```
HTTP Request
  → express middleware (cors, json)
  → route file
  → auth middleware (optional)
  → controller
  → service
  → pool.query / repository
  → MySQL | Typesense | R2
```

RFQ thêm: rate limit → viewer/history middleware → repository pattern.
