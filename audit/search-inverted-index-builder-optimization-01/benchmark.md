# Benchmark — Builder Optimization

Sample: 100 products from `product_search_index`

## Token counts

| Metric | Legacy builder | Optimized builder |
|--------|----------------|-------------------|
| Mean | 634.45 | 50.15 |
| P50 | 635 | 49 |
| P95 | 650 | 63 |
| P99 | 656 | 64 |
| Max | 658 | 68 |
| Min | 611 | 33 |

## Builder CPU time (in-memory, no DB)

| Metric | ms |
|--------|-----|
| P50 | 1.8 |
| P95 | 6.3 |
| Max | 14.7 |

## Sync time (rebuildInvertedIndexForProduct, 30 products)

| Metric | ms |
|--------|-----|
| P50 | 47 |
| P95 | 85 |
| Max | 87 |

Prior audit sync P50 was ~205 ms — **~4.4× faster** after optimization.

## Storage impact

Legacy sample total: ~63,445 token rows (100 × 634 avg)  
Optimized sample total: ~5,015 token rows (100 × 50 avg)  

Projected full corpus (7,385 products): ~371k rows vs ~4.7M rows (**−92%**).
