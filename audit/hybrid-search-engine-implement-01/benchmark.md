# HYBRID-SEARCH-ENGINE-IMPLEMENT-01 — Benchmark

Generated: 2026-06-26T08:28:06.541Z

## Indexes

- `product_meta.ft_product_meta_keywords` (FULLTEXT) — search_keywords
- `product_meta.idx_product_meta_slug` (BTREE) — slug
- `products.ft_products_search_text` (FULLTEXT) — partName,shortDescription,description
- `products.idx_products_part_number` (BTREE) — partNumber

## Service latency (ms)

| Query | Legacy P50 | Hybrid P50 | Legacy SQL | Hybrid SQL |
|-------|------------|------------|------------|------------|
| bugi toyota | 1751 | 1963 | 2 | 2 |
| bugi camry | 1747 | 143 | 2 | 2 |
| má phanh vios | 2228 | 189 | 2 | 2 |
| lọc dầu mazda | 1742 | 1905 | 2 | 2 |
| 04465-0D140 | 928 | 979 | 1 | 3 |
| đèn hậu kia | 3973 | 3821 | 2 | 2 |

## HTTP /search/suggest?query=bugi&brand=Toyota

P50 1795ms, P95 1839ms, avg 1786ms

See `benchmark.json` for full data.
