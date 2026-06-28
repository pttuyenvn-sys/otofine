# SEARCH-INDEX-POPUP-RUNTIME-01 — Benchmark

Generated: 2026-06-27T02:24:51.762Z

Feature flag: `SEARCH_POPUP_INDEX` (default **0**)

## Latency by query

| Query | Off cold | Off warm | On cold | On warm | Cold speedup |
|-------|----------|----------|---------|---------|--------------|
| bugi toyota | 390.76ms | 139.14ms | 146.48ms | 136.11ms | 62.5% |
| má phanh vios | 250.05ms | 169.29ms | 173.69ms | 174.46ms | 30.5% |
| lọc dầu mazda | 1714.32ms | 1699.84ms | 1679.5ms | 1694.98ms | 2% |
| 04465-0D140 | 824.63ms | 840.31ms | 846.08ms | 830.18ms | -2.6% |

## SQL count

| Query | Off total SQL | Off popup hydration | On total SQL | On index popup SQL |
|-------|---------------|---------------------|--------------|-------------------|
| bugi toyota | 7 | 4 | 3 | 1 |
| má phanh vios | 3 | 3 | 3 | 1 |
| lọc dầu mazda | 4 | 4 | 3 | 1 |
| 04465-0D140 | 2 | 2 | 2 | 0 |

## Notes

- **Off (0):** popup cards via `fetchBatchPreviewProductRows` (products + shops + images + fitment)
- **On (1):** popup cards via `SearchIndexDocumentReader` (single `product_search_index` SELECT, no JOINs)
- Search matching/grouping unchanged (still legacy `products` path when `SEARCH_RUNTIME=legacy`)
