# C. Danh sách tính năng — Otofine

**Legend trạng thái:**
- ✅ Hoàn chỉnh — dùng production
- 🔄 Đang làm / partial
- ⚠️ Lỗi thời / legacy
- ❌ Chưa dùng / dead

---

## 1. Authentication & Users

| Tính năng | Trạng thái | Module | DB | API |
|-----------|------------|--------|-----|-----|
| Shop đăng ký | ✅ | authController | shop_accounts | POST /api/auth/shop-register |
| Shop đăng nhập JWT | ✅ | authController | shop_accounts, shops | POST /api/auth/shop-login |
| Admin đăng nhập | ✅ | authController | admin | POST /api/auth/admin-login |
| Admin quên MK (trả plaintext) | ⚠️ | authController | admin | POST admin-forgot-password |
| Shop quên MK | ❌ route | authController | shop_accounts | **Không wired** |
| Refresh token | ❌ | — | — | — |
| RBAC chi tiết | ❌ | middleware role only | — | — |
| Email verification | ❌ | — | — | — |

### shop_accounts / Admin shop management

| Tính năng | Trạng thái | Module | DB | API |
|-----------|------------|--------|-----|-----|
| Admin list shops | ✅ | adminController | shop_accounts | GET /api/admin/shops |
| Admin duyệt shop (active) | ✅ | adminController | shop_accounts | PATCH .../status |
| Admin khóa shop (blocked) | ✅ | adminController | shop_accounts | PATCH .../status |
| Admin xóa mềm shop | 🔄 bug ENUM | adminController | shop_accounts | DELETE .../id |
| Tạo shop profile | ✅ | shop.controller | shops | POST /api/shop/ |
| Cập nhật shop profile | ✅ | shop.controller | shops | PUT /api/shop/me |

---

## 2. Products & Catalog

| Tính năng | Trạng thái | Module | DB | API |
|-----------|------------|--------|-----|-----|
| CRUD sản phẩm shop | ✅ | product.* | products, images | /api/products |
| Upload ảnh R2 | ✅ | productImage.service | product_images | POST products |
| Fitment xe (car applications) | ✅ | product.controller | product_car_applications | GET :id/cars |
| Listing công khai | ✅ | productList.service | products+JOINs | GET /api/products |
| Tìm kiếm Typesense | ✅ | productSearch.service | typesense index | GET /search |
| Related products | ✅ | productRelated.service | products | GET /related |
| Card list API | ✅ | productCard.* | products | GET /card-list |
| Import Excel | ✅ | productImport.service | products | POST /import |
| Export Excel | ✅ | productExport | products | GET /export |
| Xóa bulk | ✅ | product.controller | products | DELETE / |
| Filter theo xe/brand | ✅ | filter.routes | car_models | /api/filter/* |
| Product categories | ✅ | productCategory.* | product_categories | /api/product-categories |
| Category dictionary sync | 🔄 | categorySync.service | category_dictionary | scripts |

---

## 3. Vehicles & Address

| Tính năng | Trạng thái | Module | DB | API |
|-----------|------------|--------|-----|-----|
| Car brands/models public | ✅ | car.routes | car_models | /api/car/* |
| Car models auth (shop) | ✅ | carModel.routes | car_models | /api/car-models |
| Tỉnh/xã VN | ✅ | address.routes | address | /api/address/* |
| Location filter listing | ✅ | location.routes | shops+address | /api/locations/* |

---

## 4. SEO & Content

| Tính năng | Trạng thái | Module | DB | API |
|-----------|------------|--------|-----|-----|
| SEO slug pages | ✅ | vehicleSeo, seoPage | vehicle_seo_content, seo_* | /vehicle-seo, /seo-page |
| Sitemap generation | ✅ | seo.routes + frontend | seo_routes | GET /seo/sitemap-data |
| Category SEO content | 🔄 | categorySeo.* | category_seo_* (migration) | /category-seo/* |
| Part knowledge public | ✅ | knowledgePublic | part_knowledge | /knowledge/part/:slug |
| Part knowledge admin CRUD | ✅ | partKnowledge.* | part_knowledge | /part-knowledge |
| Batch import knowledge | ✅ | scripts | part_knowledge | POST import-batch1 |
| Master dataset 2026 | ✅ | knowledgeDataset.* | JSON + DB | npm scripts |
| SEO AI articles (Next) | ⚠️ retired | frontend api routes | — | 410 Gone |
| Frontend SEO registry JSON | ⚠️ legacy | data/seo/ | file cache | — |

---

## 5. RFQ (Request for Quote)

> Cần `RFQ_MODULE_ENABLED=true`

| Tính năng | Trạng thái | Module | DB | API |
|-----------|------------|--------|-----|-----|
| Tạo RFQ + OTP | ✅ | rfq.public | rfq_requests | POST /api/rfq/create |
| Viewer token access | ✅ | rfq.viewer | rfq_requests | GET /by-token |
| Buyer history OTP login | ✅ | rfq.history | rfq_history_* | /api/rfq/history/* |
| Chat conversations | ✅ | rfq.conversation | rfq_messages | /conversations/* |
| Shop inbox | ✅ | rfq.shop | rfq_dispatches | /api/shop/rfq/* |
| Shop quote | ✅ | rfq.shop | rfq_quotes | POST .../quote |
| Image upload RFQ | ✅ | rfq R2 | attachments | upload-image |
| Push buyer/seller | ✅ | rfqPush | rfq_push_* | /api/rfq-push/* |
| Admin analytics | ✅ | rfq.admin | rfq_* | /api/admin/rfq/analytics/* |
| Admin ops (spam, close) | ✅ | rfqAdminOps | rfq_* | /api/admin/rfq/ops/* |
| Escalation Zalo | 🔄 | rfqEscalation.worker | rfq_escalation_jobs | worker |
| Buyer reminders | 🔄 | rfqBuyerReminder | rfq_reminder_* | worker |
| Auto wave dispatch | 🔄 | rfqAutoWave | rfq_auto_wave_jobs | backend-rfq-dev worker |
| WebSocket realtime | ❌ | docs say deferred | — | polling only |

---

## 6. Notifications & Integrations

| Tính năng | Trạng thái | Module | DB | API |
|-----------|------------|--------|-----|-----|
| OneSignal web push shop | ✅ | PushInit, push.routes | shops.onesignal_player_id | POST /api/push/save-player-id |
| Zalo OA webhook | 🔄 | server.js | — | /api/zalo/webhook |
| Zalo OAuth token | ⚠️ | server.js | — | /api/zalo/oa/callback |
| Zalo test send | ⚠️ dangerous | server.js | — | /api/zalo/test-send |

---

## 7. E-commerce features KHÔNG có

| Tính năng | Trạng thái |
|-----------|------------|
| Giỏ hàng | ❌ |
| Thanh toán | ❌ |
| Đơn hàng (order) | ❌ |
| Tồn kho (inventory) | ❌ formal |
| Vận chuyển | ❌ |
| Coupon / promotion | ❌ |
| Đánh giá sản phẩm | ❌ |
| Wishlist | ❌ |

---

## 8. Operations & Background

| Tính năng | Trạng thái | Module |
|-----------|------------|--------|
| Nightly sync scheduler | ✅ | jobs/scheduler.js |
| Nightly rebuild | ✅ | jobs/nightlyRebuild.js |
| Typesense sync | ✅ | scripts |
| RFQ upload retention | ✅ | jobs/rfqUploadRetention.js |
| DB backup in repo | ⚠️ manual | db_backup_*.sql |
| Audit trail (general) | ❌ | RFQ có rfq_status_logs only |
| Centralized logging | ❌ | console.log |
| Monitoring/APM | ❌ | PM2 only |
| CI/CD | ❌ | — |

---

## 9. Cache

| Tính năng | Trạng thái | Module |
|-----------|------------|--------|
| Redis cache | 🔄 optional | redisCache.service |
| SEO page DB cache | ✅ | seo_page_cache |
| Client JSON cache | ✅ | clientJsonCache.js |
| product_list_view | 🔄 uncertain prod | migrations 001/004 |

---

## 10. API Public vs Private summary

| Public (no JWT) | Private |
|-----------------|---------|
| Product listing/detail | Shop product CRUD |
| Filters, cars, address | Shop profile |
| SEO, knowledge public | Admin * |
| RFQ create/verify (rate limited) | RFQ shop/admin |
| Health, uploads | Import/export |
