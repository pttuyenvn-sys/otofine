# Backend Analysis — Otofine Express API

---

## 1. Kiến trúc

**Pattern:** Monolithic Express, feature module RFQ tách folder nhưng cùng process.

```
server.js
├── Global: cors, json (25mb), static /uploads
├── Core routes (21 files)
├── Inline routes (products public, shop filters, zalo)
└── mountRfqRoutes() [conditional]
```

**Không có:** global error handler, request ID, structured logging, API versioning.

---

## 2. Thư mục & trách nhiệm

| Thư mục | Files | Chức năng |
|---------|-------|-----------|
| `routes/` | 21 | HTTP mapping |
| `controllers/` | 31 | Request/response |
| `services/` | 54 | Business logic |
| `repositories/` | 4 + RFQ 17 | SQL abstraction (RFQ only) |
| `middlewares/` | 3 + RFQ 8 | Auth, upload, rate limit |
| `utils/` | 42 | Helpers (SEO slug, listing normalize…) |
| `modules/rfq/` | ~88 | RFQ bounded context |
| `migrations/` | 46 SQL | Schema changes |
| `jobs/` | 12 | Background workers |
| `scripts/` | 28 | CLI maintenance |
| `config/` | db, r2, rfq, typesense | Infrastructure |
| `models/` | 2 | Thin wrappers (**hầu hết unused**) |

---

## 3. Module hoạt động vs chưa dùng

### Đang hoạt động (production-critical)

| Module | Files chính |
|--------|-------------|
| Auth / shop_accounts | `authController.js`, `auth.routes.js`, `adminController.js` |
| Shop profile | `shop.controller.js`, `shop.model.js`, `shop.routes.js` |
| Products CRUD | `product.controller.js`, `product.service.js` (987 lines) |
| Product listing | `productList.service.js`, `productList.routes.js` |
| Product search | `productSearch.service.js`, Typesense |
| Import/Export Excel | `productImport.service.js`, `productExport.routes.js` |
| Filters/Cars | `filter.routes.js`, `car.routes.js`, `carModel.routes.js` |
| SEO engine | `seoPage.service.js`, `seoComposer.js`, `vehicleSeo.service.js` |
| Part knowledge | `partKnowledge.repository.js`, controllers |
| Push | `push.routes.js`, `onesignalService.js` |
| Address | `address.routes.js` |

### Có điều kiện (env flag)

| Module | Flag |
|--------|------|
| RFQ full stack | `RFQ_MODULE_ENABLED=true` |

### Chưa dùng / dead code

| File | Lý do |
|------|-------|
| `controllers/adminAuthController.js` | Never imported, missing model |
| `models/product.model.js` | Never imported, syntax error |
| `authController.shopForgotPassword` | No route |
| `middlewares/upload.js` → `upload` export | multer-s3 unused |
| `initDB.js` | Outdated schema |
| `importCars.js`, `cars.xlsx` | Standalone |
| `server.js.save` | Editor backup |
| `modules/rfq/queues/rfqEscalation.placeholder.js` | Placeholder |

---

## 4. shop_accounts — Phân tích sâu

### 4.1 Không phải code module

Toàn bộ logic nằm trong **4 touchpoints**:

1. **`registerShop`** — INSERT pending, UUID `shopId`
2. **`shopLogin`** — bcrypt verify, status active, JWT với `shop_accounts.id`
3. **`adminController`** — list, approve/block, soft delete
4. **`requireShop`** — map JWT id → `shops.id`

### 4.2 Hai ID system (nguy cơ nhầm)

| ID | Bảng | Dùng cho |
|----|------|----------|
| `shop_accounts.id` | shop_accounts | JWT `req.user.id`, admin list key |
| `shops.id` | shops | `products.shopId`, RFQ `shop_id`, OneSignal |

Login response trả cả hai — frontend lưu `shopId` = `shops.id`.

### 4.3 Thiếu trong flow hiện tại

- Email verification sau register
- Tự động tạo `shops` row khi register (có thể cần bước POST `/api/shop/` riêng)
- Password reset qua email (forgot password dev-only)
- Audit log thay đổi status
- RBAC fine-grained

### 4.4 Code references

```javascript
// JWT uses shop_accounts.id
jwt.sign({ id: shopUser.id, role: "shop", email }, JWT_SECRET, { expiresIn: "7d" });

// requireShop resolves shops.id
SELECT id FROM shops WHERE accountId = ?
```

---

## 5. Code duplicate & coupling

| Issue | Chi tiết |
|-------|----------|
| `product.service.js` vs `productService.js` | Naming collision — search sync vs CRUD |
| Auth routes duplicated | `/api/auth` + `/api/admin` |
| Shop filter 3 paths | server.js inline + routes |
| SEO composers | `seoComposer.js`, `categorySeoComposer.js`, `buildVehicleSeoArticle.js` overlap |
| Listing SQL | Duplicated JOIN logic listing vs card vs search |

**Coupling cao:**
- `server.js` ↔ nhiều inline routes (khó test)
- Product listing ↔ schema column detection (`productsTableColumns.server.js`)
- RFQ ↔ `shops.last_seen_at` touch middleware

---

## 6. Files quá lớn cần tách

| File | Lines | Đề xuất |
|------|-------|---------|
| `services/product.service.js` | 987 | Tách CRUD / images / cars |
| `services/seoPage.service.js` | 1006 | Tách cache / compose / resolve |
| `services/categorySync.service.js` | 1060 | Tách sync steps |
| `controllers/product.controller.js` | 536 | Tách import vs CRUD |
| `repositories/partKnowledge.repository.js` | 587 | OK nếu giữ repository pattern |

---

## 7. Dependency vòng

**Không phát hiện import cycle nghiêm trọng** (static analysis). RFQ module self-contained tốt.

**Risk:** `server.js` import hầu hết routes → khó unit test without full app.

---

## 8. Background jobs

| Job | npm script | Chạy |
|-----|------------|------|
| `scheduler.js` | `sync:scheduler` | node-cron 3am |
| `nightlyRebuild.js` | `sync:nightly` | Manual/cron |
| `rfqEscalation.worker.js` | `worker:rfq-escalation` | PM2 separate |
| `rfqBuyerReminder.worker.js` | `worker:rfq-buyer-reminder` | PM2 |
| `rfqUploadRetention.js` | `cron:rfq-upload-retention` | Cron |
| Typesense sync | `sync:typesense` | Script |

**Không embed trong server.js** — cần PM2/cron riêng.

---

## 9. Dual database engine

`config/db.engine.js`: `mysql` (default) hoặc `mssql` cho `part_knowledge` migrations/import.

**Production marketplace:** MySQL only.

---

## 10. Technical debt backend

- No ORM → migration drift risk
- No centralized validation
- No API versioning
- No OpenAPI spec
- Inconsistent error responses
- Zalo routes registered after `listen()`
- RFQ default OFF — dev/prod parity risk
