# SEARCH-INDEX-RUNTIME-PHASE-02

Feature-flagged dual search runtime. Default remains **legacy**; index runtime is opt-in via `SEARCH_RUNTIME=index`.

## Architecture

```
HTTP controllers / services
        │
        ▼
getSearchRuntime()  ← SEARCH_RUNTIME env
        │
   ┌────┴────┐
   ▼         ▼
Legacy    SearchIndex
Runtime   Runtime
   │         │
products  product_search_index
+ joins   (no fitment/category JOINs)
   │         │
   └────┬────┘
        ▼
  hydrate products (allowed JOIN)
        ▼
  existing ranking + SEO URL builders (unchanged)
```

### Interface (both runtimes)

| Method | Purpose |
|--------|---------|
| `searchSuggest()` | Popup groups + preview + categories + viewAll |
| `searchSidebar()` | Sidebar category suggestions |
| `searchPreview()` | Batch preview blocks |
| `searchInventory()` | Grouped vehicle/category inventory |
| `searchProducts()` | Public product search API |

### Files

| File | Role |
|------|------|
| `config/searchRuntimeConfig.js` | `SEARCH_RUNTIME` flag |
| `services/search/runtime/searchRuntime.js` | Facade |
| `services/search/runtime/LegacySearchRuntime.js` | Current products path |
| `services/search/runtime/SearchIndexRuntime.js` | Index → hydrate path |
| `services/search/runtime/indexSearchExecution.js` | Provider cascade on `psi` |
| `services/search/runtime/indexInventoryQuery.js` | Grouped inventory + preview |
| `services/search/runtime/indexProductHydration.js` | Products hydration only |
| `services/search/runtime/searchSuggestAssembly.js` | Shared JSON + SEO URLs |

## Feature flag

```bash
# Default — no change
SEARCH_RUNTIME=legacy

# Enable index runtime
SEARCH_RUNTIME=index
pm2 restart otofine-backend
```

No automatic switch. Parser, intent, popup UI, SEO URLs, canonical, ranking rules, and response JSON shape are unchanged.

## Index runtime flow

1. `FROM product_search_index psi WHERE status = 'active'`
2. Hybrid provider cascade (exact → structured → fulltext → like) on index columns
3. Collect `product_id` list (groups / top-k)
4. `JOIN products` **only** for hydration (price, images, shop, stock)
5. Apply existing `buildListOrderBy`, `sortSuggestPreviewProducts`, `rankSearchPreviewGroups`, `listingSuggestUrls`

### Forbidden during search execution

- `JOIN product_car_applications`
- `JOIN car_models`
- `JOIN product_category_map` / `product_categories`

### New index fields (migration 071)

| Column | Purpose |
|--------|---------|
| `canonical_slug` | Group / SEO URLs without category JOIN |
| `search_priority` | Category ordering in groups |
| `part_number_norm` | Exact OEM match without products scan |

Applied via `ensureSearchIndexSchema.js`. Re-sync: `npm run rebuild:search-index` or wait for live sync.

## Benchmark (representative queries, n=4)

| Runtime | Avg | P50 | P95 | Max |
|---------|-----|-----|-----|-----|
| Legacy | 1386 ms | 467 ms | 2896 ms | 2896 ms |
| Index | 153 ms | 70 ms | 350 ms | 350 ms |

Scoped queries (brand+keyword, part number) are **faster** on index. Unscoped single-token LIKE (`bugi` alone) can be slower on index (~120s) — LIKE scans `product_search_index`; optimize before broad cutover.

## Validation

```bash
cd backend && npm run validate:search-runtime
```

Sample results (4 representative queries):

| Query | Top-10 overlap | Top-20 overlap | URLs |
|-------|----------------|----------------|------|
| bugi toyota | 60% | 95% | OK |
| má phanh vios | 50% | 90% | OK |
| 04465-0D140 | 100% | 100% | OK |
| lọc dầu mazda | 100% | 100% | OK |

**URLs / navigation: 100% identical** (viewAll + group links use same `listingSuggestUrls.js`).

ID order may differ when legacy uses `popular` sort fields (price, stock, freshness) after hydration — expected until those fields are indexed or ranking is unified post-hydration.

## Remaining JOIN report

| Stage | Legacy | Index runtime |
|-------|--------|---------------|
| Search match | `products` + fitment + category map | `product_search_index` only |
| Group slug | `product_categories` JOIN | `psi.canonical_slug` (denormalized) |
| Preview cards | products + fitment LATERAL | index match → products hydrate |
| Product search API | Typesense or `products` LIKE | `product_search_index` (skips Typesense when `SEARCH_RUNTIME=index`) |

**Still joined at hydration (allowed):** `products`, `shops`, `address`, `product_images`.

## Migration notes

1. Apply schema: `ensureSearchIndexSchema` runs on rebuild/validation (adds 071 columns).
2. Backfill new fields: `cd backend && npm run rebuild:search-index` (or incremental sync).
3. Canary: `SEARCH_RUNTIME=index` on staging, run `npm run validate:search-runtime`.
4. Production: keep `legacy` until top-k parity targets met for your traffic mix.

## Rollback

```bash
SEARCH_RUNTIME=legacy
pm2 restart otofine-backend
```

Instant — no schema rollback required. Index table and sync continue; only runtime selection changes.

## What did NOT change

Parser, intent, scope, popup UI, SEO URLs, canonical, sitemap, product detail, listing page, category/vehicle ordering rules, response JSON contracts.
