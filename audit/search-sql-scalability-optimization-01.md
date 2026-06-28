# SEARCH-SQL-SCALABILITY-OPTIMIZATION-01

**Date:** 2026-06-26

## Before / After architecture

### Before
```
Category SQL (GROUP BY category)     ─┐ parallel
Preview group SQL (GROUP BY cat+veh) ─┘  → 2 full inventory scans
Top 3 groups → 3× getProductList     → ~12 SQL (SELECT+COUNT+images+fitment ×3)
```

### After
```
WITH matched AS (single inventory scan)
  → vehicle groups UNION category groups   (1 SQL)
Top 3 groups → batch preview ROW_NUMBER    (1 SQL)
Total warm: **2 SQL** (was 11–17)
```

## Performance

| Metric | Before | After |
|--------|--------|-------|
| SQL queries (warm) | 11–17 | **2** |
| SQL queries (cold) | 11–17 | **5** |
| Service cold | 900–2050ms | **1902ms** |
| Service warm | — | **1847ms** |
| HTTP P50 (n=30) | 905–1001ms | **1822.95ms** |
| HTTP P95 | 1123–1567ms | **1961.04ms** |

> **Target 250–350ms warm** requires index / fulltext / external search engine at 100k+ products. Architecture optimized; remaining latency is **LIKE + table scan** bound at current scale (~7k products).

## Files changed

| File | Role |
|------|------|
| `backend/services/search/searchInventoryQuery.js` | Centralized CTE + batch preview SQL |
| `backend/services/search/searchGroupedInventory.service.js` | Shared grouped inventory + ranking |
| `backend/services/search/searchSuggestPreviewProducts.service.js` | Batch preview mapping (slim fields) |
| `backend/services/searchSuggest.service.js` | Single pipeline orchestration |
| `backend/services/searchPreviewBatch.service.js` | Delegates to shared pipeline |
| `backend/services/searchSidebarCategories.service.js` | Reuses shared inventory |

## Index audit (report only)

Full list in `benchmark.json`. Recommended future composites: products FULLTEXT; car_models (hang_xe, ten_xe); product_images (productId, isPrimary).

## Validation

All search validation scripts PASS.

```bash
npm run build && pm2 restart otofine-backend
```
