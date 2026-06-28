# SEARCH-INDEX-SYNC-IMPLEMENT-01

Application-level synchronization of `product_search_index` after product lifecycle events. Search runtime is unchanged — providers still read `products`.

## Architecture

```
Product / admin / shop / category event
        │
        ▼
searchIndexDispatcher.js     ← queue-ready (immediate today)
  queueSearchIndexSync()
  queueSearchIndexDelete()
  queueSearchIndexRebuild()
  queueSearchIndexSyncForShop()
        │
        ▼
SearchIndexSyncService.js
  syncProduct / deleteProduct / syncVehicle / …
        │
        ▼
product_search_index
```

| Layer | Role |
|-------|------|
| `searchIndexDispatcher.js` | Fire-and-forget jobs; swap `setSearchIndexExecutor()` for BullMQ/Redis later |
| `SearchIndexSyncService.js` | Load product source, build documents, hash-gated upsert/prune |
| `searchIndexDocument.builder.js` | Denormalized document from `products` + fitments |
| `searchIndexDocumentHash.js` | SHA-256 of searchable fields only |
| `searchIndexConfig.js` | `SEARCH_INDEX_SYNC_ENABLED`, `CURRENT_SEARCH_INDEX_VERSION` |

## Sync flow

1. Caller invokes `queueSearchIndexSync(productId, { source, reason })` after DB commit.
2. Dispatcher runs job in-process (errors logged, `retryReady: true` — never throws to caller).
3. `syncProduct`:
   - Load product + fitments + visibility gate.
   - If missing or not publicly visible → `DELETE` index rows.
   - Build expected documents (one per fitment, or one sentinel row).
   - Compare `document_hash` per `(model_id, year_from, year_to)` key.
   - Upsert only changed/stale rows; prune removed fitment keys.
4. `deleteProduct` removes all rows for `product_id`.

### Wired events

| Event | Caller | Dispatcher |
|-------|--------|------------|
| Product created | `product.service.js` `createProduct` | `queueSearchIndexSync` |
| Product updated | `product.service.js` `updateProduct` | `queueSearchIndexSync` |
| Product deleted | `product.service.js` `deleteProduct` / `deleteProducts` | `queueSearchIndexDelete` |
| Keywords / meta | `productService.js` `syncProduct` | `queueSearchIndexSync` |
| Approval / moderation | `productModeration.admin.controller.js` | `queueSearchIndexSync` |
| Shop location | `shop.controller.js` | `queueSearchIndexSyncForShop` |
| Category map (bulk sync) | `categorySync.service.js` | `queueSearchIndexSync` per product |

**Not wired:** `updateProductStock` (stock-only), thumbnail, display order — hash skip also ignores unchanged searchable fields on full updates.

## Hash flow

`document_hash` = SHA-256 of:

`product_name`, `part_number`, `search_keywords`, `search_text`, `category_name`, `category_id`, `brand_name`, `model_name`, `model_id`, `year_from`, `year_to`, `location_name`, `location_id`, `status`

Before upsert: if hash unchanged **and** `search_version` current → skip row (no write).

Ignored for hash (not in index document): price, stock, sales count, view count, thumbnail, display order.

## Version flow

- `search_version` column (migration `070_product_search_index_sync.sql`).
- `CURRENT_SEARCH_INDEX_VERSION` from env `SEARCH_INDEX_VERSION` (default `1`).
- `rebuildAll({ staleVersionOnly: true })` (default) resyncs only products with any row where `search_version < current`.
- CLI full rebuild: `npm run rebuild:search-index` (truncates + `rebuildAll` with `force`).

## Error handling

Product save/delete transactions never await index sync. Failures log:

```json
{ "type": "sync", "productId": 123, "source": "product.update", "error": "…", "retryReady": true }
```

## Observability

Set `SEARCH_INDEX_SYNC_DEBUG=1` or `NODE_ENV=development` for:

```
[search-index-sync] source=product.update productId=123 hashChanged=true action=upsert durationMs=42
```

## Validation

```bash
cd backend && npm run validate:search-index-sync
```

Random mutations (100 per phase): update name, hide (visibility), fitment year, category — compare via `searchIndexCompare.server.js`.

```bash
cd backend && npm run validate:search-index
```

Count parity vs legacy inventory shape.

## Benchmark (representative)

From `validate-search-index-sync-01.mjs` on production dataset (7385 products, 8602 documents):

| Phase | Avg | P50 | P95 | Max |
|-------|-----|-----|-----|-----|
| update | 56 ms | 55 ms | 84 ms | 130 ms |
| delete | 35 ms | 32 ms | 55 ms | 82 ms |
| vehicle | 43 ms | 41 ms | 64 ms | 110 ms |
| category | 33 ms | 31 ms | 51 ms | 116 ms |

Hash skip on unchanged rows: ~2–5 ms (read + compare only).

## Rollback

1. Disable sync: `SEARCH_INDEX_SYNC_ENABLED=0` (env on `otofine-backend`).
2. Search runtime unaffected — no provider reads `product_search_index`.
3. Remove dispatcher calls from services if needed (single revert).
4. Index table can remain; optional `TRUNCATE product_search_index`.

## Files

| File | Purpose |
|------|---------|
| `migrations/070_product_search_index_sync.sql` | `document_hash`, `search_version` |
| `config/searchIndexConfig.js` | Feature flag + version |
| `services/search/searchIndexDispatcher.js` | Queue-ready entry points |
| `services/search/SearchIndexSyncService.js` | Sync logic |
| `services/search/searchIndexDocumentHash.js` | Hash |
| `services/search/searchIndexCompare.server.js` | Parity validation |
| `scripts/validate-search-index-sync-01.mjs` | Mutation + benchmark |

## No search usage

`searchExecutionLayer`, providers, parser, ranking, popup, SEO listing — **unchanged**. `SEARCH_ENGINE_MODE` still targets `products` / `product_meta`.
