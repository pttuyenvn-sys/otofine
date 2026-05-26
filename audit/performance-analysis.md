# Performance Analysis — Otofine

**Phương pháp:** Static code review + schema analysis. Không có APM traces trong scope.

---

## 1. Bottleneck lớn nhất (ước lượng)

| Rank | Area | Lý do |
|------|------|-------|
| 1 | **Product listing SQL** | JOIN `products` + `product_car_applications` + `car_models` + `shops` + `address`; `product_list_view` có thể chưa trên prod |
| 2 | **Typesense sync lag** | Search index có thể stale nếu sync không chạy đều |
| 3 | **RFQ inbox queries** | Complex JOINs unread counts (`rfqDispatch.repository.js`) |
| 4 | **SEO page generation** | `seoPage.service.js` 1000+ lines, cache rebuild nặng |
| 5 | **Image processing** | Sharp on upload — CPU bound |
| 6 | **No CDN cache headers** | API responses mostly uncached |

---

## 2. Database / Query

### N+1 risks

| Location | Pattern |
|----------|---------|
| `product.controller.js` | Loop insert images/attributes sau create |
| `productRelated.service.js` | Multiple sequential queries (có optimize partial) |
| RFQ inbox | Subqueries per dispatch — monitor EXPLAIN |

### Query chậm tiềm năng

- Public `GET /api/products` với vehicle filters → conditional JOIN (`listingQueryNeedsVehicleFitmentJoin`)
- `GET /api/products/search` → Typesense fallback MySQL LIKE?
- Part knowledge list pagination
- Admin RFQ analytics aggregations

### Indexing gaps (đề xuất verify trên prod)

```sql
-- Đề xuất kiểm tra
SHOW INDEX FROM products;
SHOW INDEX FROM product_car_applications;
SHOW INDEX FROM rfq_messages;
```

- `products(shopId, createdAt DESC)`
- `product_car_applications(carModelId, productId)`
- `rfq_messages(conversation_id, created_at)`

---

## 3. API nặng

| Endpoint | Concern |
|----------|---------|
| `GET /api/products` | Large result sets — pagination? |
| `POST /api/products/import` | Excel parse + many INSERTs |
| `GET /api/product-export/export` | Full shop export |
| `GET /api/seo/sitemap-data` | Aggregates many URLs |
| RFQ `GET /inbox` | N+1 unread |
| `POST /api/products/` + images | 25MB body |

---

## 4. Caching

| Layer | Status |
|-------|--------|
| Redis | `redisCache.service.js` — optional, memory fallback |
| `seo_page_cache` table | DB cache ✅ |
| `clientJsonCache.js` | Browser only |
| HTTP Cache-Control | Không thấy middleware |
| Next.js ISR | `[slug]` revalidate 3600 |

**Chưa tối ưu:** API listing không cache; RFQ poll không ETag.

---

## 5. Frontend bundle

**Dependencies nhẹ** — không MUI. Risk areas:

- `react-quill-new` — editor bundle lớn, chỉ shop pages
- `react-icons` — tree-shake Feather subset OK
- RFQ pages client-heavy — code split by route (Next default)

**Đề xuất:** `next/dynamic` cho Quill, OneSignal.

---

## 6. Memory risks

- PM2 `otofine-backend` ~129MB RSS (snapshot) — OK
- Multer memory storage uploads — spike on concurrent large uploads
- In-memory rate limit Maps (RFQ) — leak nếu không TTL cleanup

---

## 7. Pagination & lazy loading

| Feature | Pagination |
|---------|------------|
| Product listing | Query params `page`, `pageSize` via normalize |
| Shop products | Có filter, verify limit |
| RFQ messages | Poll + cursor? — check controller |
| Admin shops | **Không** — full list |

---

## 8. Render thừa (frontend)

- Home + listing: nhiều `useEffect` fetch
- RFQ chat: polling interval — tune khi scale
- Không React.memo rộng rãi — profile khi cần

---

## 9. Ưu tiên tối ưu đầu tiên

1. **Verify `product_list_view` trên production** + nightly sync job chạy
2. **EXPLAIN** slow query log cho `GET /api/products`
3. **Typesense** health + incremental sync
4. **RFQ inbox** — materialized unread counts hoặc Redis
5. **CDN** cho R2 images (đã có img.otofine.com)
6. **Giảm body limit** default 25MB → route-specific

---

## 10. Scaling blockers

| Blocker | Khi scale |
|---------|-----------|
| In-memory RFQ rate limits | Multi-instance PM2 |
| Single MySQL writer | Read replicas needed |
| No queue for import | Excel import blocks event loop |
| Static uploads on disk | Move all to R2 |
