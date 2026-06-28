# SEARCH-RUNTIME-TRACE-AUDIT-01 — Readiness

## Can popup search run entirely from product_search_index today?

**NO**

Both runtimes require `products` (and related tables) for preview card hydration even when matching uses the index.

### Fields/joins that force products dependency

- Preview card fields (price, stock, shopName, provinceName, imageUrl) fetched from products + shops + address
- product_images thumbnail subquery requires products.id
- buildProductIdentity / canonicalPath uses fitment from product_car_applications at hydration
- Legacy runtime: entire suggest pipeline starts FROM products with fitment JOINs

## Function-level readiness

| Function | Index for matching | Still needs products |
|----------|-------------------|---------------------|
| searchSuggest | NO | YES (preview hydration) |
| searchSidebar | NO | PARTIAL (getModels when brand-only) |
| searchPreview | NO | YES (preview hydration) |
| searchInventory | NO | NO (returns groups only) |
| searchProducts | NO | YES (full card hydration + fitment) |

## Migration blockers

- SEARCH_RUNTIME=legacy (default) — index runtime not active in production
- Suggest pipeline executes 2+ heavy products scans per request (grouped CTE + batch preview)
- Provider cascade may run extra COUNT/SAMPLE queries on products during fulltext gate
- searchProducts still uses Typesense or legacy products searchProductIds when runtime=legacy

## Current state summary

- Active runtime: **LegacySearchRuntime**
- Index table used in traced SQL: **0%** of statements
- `product_search_index` sync: enabled (background), not controlling live search while runtime=legacy

Diagnosis only — no implementation recommended.
