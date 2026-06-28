# SEARCH-INVERTED-INDEX-BUILDER-OPTIMIZATION-01

Optimized `SearchTokenIndexBuilder` — canonical fields only, no token blob replay.

## Results (100 products)

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Avg tokens/product | 634.45 | 50.15 | −92.1% |
| P95 | 650 | 63 | |
| Max | 658 | 68 | |

## Rollback

`SEARCH_INVERTED_INDEX_LEGACY_BUILDER=1` restores prior builder.

See [validation.md](./validation.md), [benchmark.md](./benchmark.md).
