# SEARCH-INDEX-COMPLETE-DOCUMENT-01

**Status: PASS**

## Objective

Denormalize popup-render fields into `product_search_index` so future search runtime can serve suggest previews without fitment/category/image JOINs — without changing live search, APIs, SEO, or frontend.

## What changed

### Schema (v2)

13 new columns on `product_search_index`:

`title`, `canonical_path`, `canonical_url`, `thumbnail_url`, `brand_slug`, `model_slug`, `vehicle_label`, `category_slug`, `shop_name`, `price`, `stock_status`, `popularity_score`, `search_score`

Applied via `ensureSearchIndexSchema.js` + migration `072_product_search_index_complete_document.sql`.

### Sync pipeline

- `searchIndexDocument.builder.js` — builds popup + SEO fields using `buildProductIdentity`, primary image, shop, price, stock
- `searchIndexDocumentHash.js` — hash includes all new fields
- `SearchIndexSyncService.js` — UPSERT extended; source query loads price/stock/shop/image
- `searchIndexCompare.server.js` — parity checks extended
- `CURRENT_SEARCH_INDEX_VERSION` → **2**

### Validation

Script: `backend/scripts/validate-search-index-complete-document-01.mjs`

| Result | Value |
|--------|-------|
| Parity (150 products) | 100% |
| Stale rows | 0 |
| Popup title/url/shop | 100% fill |
| Thumbnail | 95.3% (no-image products) |

## Popup readiness

These fields are available **directly from `product_search_index`** (no fitment/category/image JOIN):

- title
- thumbnail_url
- vehicle_label
- price
- shop_name
- province (location_name)
- canonical_url
- part_number
- stock_status

## Not changed (acceptance)

- Parser, intent, ranking rules
- SEO URLs (same `buildProductIdentity` algorithm)
- API response shape
- Frontend UI
- `SEARCH_RUNTIME` (still `legacy`)

## Deliverables

| File | Description |
|------|-------------|
| [document-schema.md](search-index-complete-document-01/document-schema.md) | Column reference |
| [field-mapping.md](search-index-complete-document-01/field-mapping.md) | Source → index mapping |
| [sync-validation.md](search-index-complete-document-01/sync-validation.md) | Parity + fill rates |
| [benchmark.md](search-index-complete-document-01/benchmark.md) | Size + sync + JOIN estimates |
| [validation.json](search-index-complete-document-01/validation.json) | Machine-readable results |

## Next phase (out of scope)

Wire `SearchIndexRuntime` preview assembly to read document fields instead of `hydrateProductsForSearch` — requires explicit runtime switch, not done here.
