# SEARCH-INVERTED-INDEX-FULL-BACKFILL-01

Generated: 2026-06-27T04:49:37.305Z

## Summary

| Metric | Value |
|--------|-------|
| Indexed products | 7385 |
| Products with tokens | 7385 |
| Coverage | 100% |
| Missing products | 0 |
| Duplicate groups | 0 |
| Broken references | 0 |
| Failed products | 0 |

## Token distribution

| Stat | Value |
|------|-------|
| Avg tokens/product | 47.75 |
| P50 | 47 |
| P95 | 63 |
| P99 | 69 |

## Benchmark

| Metric | Value |
|--------|-------|
| Total time (ms) | 16 |
| Products/sec | 450473.17 |
| Peak memory (MB) | 55 |
| Batches | 15 |
| Workers | 2 |

## Acceptance

- Coverage 100%: PASS
- Duplicate rows 0: PASS
- Missing products 0: PASS
- Runtime unchanged: PASS (read-only data generation)

## Artifacts

- [coverage.json](./search-inverted-index-full-backfill-01/coverage.json)
- [checkpoint.json](./search-inverted-index-full-backfill-01/checkpoint.json)
- [failed-products.json](./search-inverted-index-full-backfill-01/failed-products.json)
- [benchmark.json](./search-inverted-index-full-backfill-01/benchmark.json)
