# Slow query report — SEARCH-PRODUCTION-STABILIZATION-01

**Endpoint:** `GET https://otofine.com/api/search/suggest`  
**Runtime:** InvertedSearchRuntime  
**Samples:** 15 queries × 3 runs (45 total)

---

## Threshold: >1000 ms

**Count: 0**

No suggest request exceeded 1000 ms TTFB during this audit.

---

## Slowest queries (by average TTFB)

| # | Label | Query | Scope | Avg TTFB | Max TTFB | Avg size | Groups |
|---|-------|-------|-------|----------|----------|----------|--------|
| 1 | den_hau_kia | đèn hậu | Kia | 323 ms | 389 ms | ~18 KB | 3 |
| 2 | loc_gio_toyta | lọc gió | Toyota | 300 ms | 336 ms | — | 3 |
| 3 | ma_phanh_vios | má phanh | Toyota Vios | 268 ms | 287 ms | ~10 KB | 3 |
| 4 | giam_xoc_ford | giảm xóc | Ford | 228 ms | — | — | 3 |
| 5 | bo_thang | bố thắng | (none) | 225 ms | — | ~12 KB | 3 |
| 6 | phanh_toyota | phanh | Toyota | 197 ms | — | — | 3 |
| 7 | loc_dau_mazda | lọc dầu | Mazda | 194 ms | — | ~4 KB | 3 |
| 8 | den_pha_honda | đèn pha | Honda | 170 ms | — | — | 3 |
| 9 | bugi_toyota | bugi | Toyota | 157 ms | — | ~7 KB | 3 |
| 10 | binh_nuoc | bình nước | (none) | 154 ms | — | — | 3 |

---

## Legacy comparison (pre-cutover)

Queries that were **legacy-slow** are now **inverted-fast**:

| Query | Legacy TTFB (cutover before) | Stabilization avg | Improvement |
|-------|------------------------------|-------------------|-------------|
| đèn hậu Kia | **3,847 ms** | 323 ms | **−92%** |
| lọc dầu Mazda | **1,775 ms** | 194 ms | **−89%** |
| bố thắng | ~4,000 ms (prior audit) | 225 ms | **−94%** |

---

## Fast empty queries

| Query | Avg TTFB | Result |
|-------|----------|--------|
| 04465-0D140 | 107 ms | 0 groups, 0 categories |
| brake pad | 141 ms | 0 groups, 0 categories |
| ấm sắc Toyota | 130 ms | 0 groups, 0 categories |

These are **correct no-result** responses, not performance failures.

---

## Distribution summary

```
P50:  173 ms
P90:  287 ms
P95:  337 ms
P99:  389 ms
Max:  389 ms
```

All production suggest latency in this sample is **sub-second**.
