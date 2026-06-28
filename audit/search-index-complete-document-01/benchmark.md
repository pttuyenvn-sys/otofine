# Performance Benchmark — Complete Search Document

## Document size

| Metric | Value |
|--------|-------|
| Active documents | 8,602 |
| Distinct products | 7,385 |
| Avg payload chars | ~6,499 |
| Avg document bytes | ~6,592 |

Storage increase vs v1: ~13 new columns per row; avg ~2–4 KB additional text per document (URLs, title, labels).

## Sync time

| Operation | Duration |
|-----------|----------|
| Full stale rebuild (7,385 products) | 109.6s |
| Per-product force sync (p50) | 12.6ms |
| Per-product force sync (p95) | 19.8ms |

Normal updates: hash gate skips write when popup fields unchanged (~same as v1 for no-op edits).

## Estimated JOIN reduction (future runtime)

When `SEARCH_RUNTIME=index` popup hydration is wired to document fields:

| Current (legacy popup SQL) | Future (index document) |
|----------------------------|-------------------------|
| JOIN products | — |
| JOIN shops | — |
| JOIN address | — |
| JOIN product_category_map | — |
| JOIN product_categories | — |
| JOIN product_car_applications | — |
| JOIN car_models | — |
| Subquery product_images | — |

**8 JOINs eliminated per preview product row.**

## Estimated popup query reduction

| Metric | Current | Future |
|--------|---------|--------|
| Queries per suggest | 2+ heavy `products` scans | 1 `product_search_index` scan |
| Hydration query | Full product SELECT + LATERAL fitment | **None** (fields on index row) |
| Est. query count reduction | — | ~50% per suggest request |

## Runtime status

- `SEARCH_RUNTIME` **unchanged** (`legacy`)
- No API / frontend / SEO changes in this phase
- Index sync enabled; documents ready for next runtime phase
