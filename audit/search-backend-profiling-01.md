# SEARCH-BACKEND-PROFILING-01

**Date:** 2026-06-26  
**Mode:** READ-ONLY AUDIT — no SQL/index/cache/logic changes  
**MySQL:** 8.0.44-0ubuntu0.22.04.2

---

## Objective

Profile `GET /api/search/suggest` to locate where the **900–1900ms** server time is spent.

---

## Architecture (unified pipeline)

```
GET /api/search/suggest
        │
        ├─ 1. Parse query (keyword)
        ├─ 2. Resolve scope (normalizeListingQuery)
        │
        ├─ PARALLEL ─────────────────────────────────────┐
        │                                               │
        │  PREVIEW BRANCH                    CATEGORY BRANCH
        │  ├─ 3. Preview group SQL           ├─ 3b. Category SQL
        │  │     (JOIN pcm, pc, pa, cm)      │     (JOIN pcm, pc [, pa, cm])
        │  │     GROUP BY category+vehicle    │     GROUP BY category
        │  ├─ 4. rankSearchPreviewGroups     ├─ 4b. rankCategorySidebarSuggestions
        │  ├─ 5. Top 3 groups                │     (+ getModels if brand-only)
        │  ├─ 6. Preview SQL ×3              │
        │  │     getProductList per group      │
        │  │     (SELECT + COUNT + images     │
        │  │      + fitment per group)       │
        │  ├─ 7. Global dedupe (max 2/group) │
        │  └─ 8. sortSuggestPreviewProducts  │
        │                                               │
        └───────────────────────────────────────────────┘
        │
        ├─ 9. Group mapping + URL building
        └─ 10. JSON serialization → response
```

---

## Stage timing (production critical path)

**HTTP observed (bugi toyota):** cold **1640ms** → warm **905–978ms** (listing cache + schema cache).  
**Load test P50:** **905–1001ms** · **P95:** **1123–1567ms** · **avg:** **~1011ms**.

Production runs preview + category in `Promise.all`. **Wall ≈ max(preview branch, category branch) + ~3ms assembly.**

### Average branch times (7 queries)

| Branch / stage | Avg ms | % of critical path |
|----------------|--------|---------------------|
| **Preview branch (critical path)** | **1537** | **~100%** |
| ↳ Preview group SQL (GROUP BY category+vehicle) | 960 | **62%** |
| ↳ Preview product SQL (3× `getProductList`, parallel wall) | 581 | **38%** |
| ↳ Preview ranking | 73 | <5% |
| Category branch (usually hidden in parallel) | 1100 | n/a |
| ↳ Category sidebar SQL | 960 | — |
| ↳ Category ranking (+ `getModels` if brand-only) | 138 | — |
| Parse + scope + URLs + JSON | <3 | <1% |

> Staged audit runs branches **sequentially** for attribution (wall ~2630ms avg). SQL durations **sum** across queries (~12 per request); parallel `getProductList` wall is lower than summed SQL time.

### Stage table (instrumented averages)

| Stage | Avg ms | Notes |
|-------|--------|-------|
| Preview group SQL | 960 | Table scan + 4 JOINs + GROUP BY |
| Preview product SQL (3× parallel wall) | 581 | 3× (SELECT+COUNT+images+fitment) |
| Category sidebar SQL | 960 | Runs parallel; hidden when preview slower |
| Category ranking | 138 | Includes `getModels` for brand-only scope |
| Preview ranking | 73 | In-memory |
| JSON serialization | 0.5 | Negligible |
| Parse + resolve scope | 0.1 | Negligible |

---

## Per-query wall time

| Query | Wall ms | SQL ms | Queries | JSON KB | Groups | Products |
|-------|---------|--------|---------|---------|--------|----------|
| bugi toyota | 2421.6 | 4838.7300000000005 | 17 | 46.2 | 3 | 6 |
| bugi camry | 2155.54 | 2503.87 | 6 | 23.7 | 2 | 3 |
| má phanh vios | 2864.48 | 5692.799999999999 | 14 | 49.4 | 3 | 6 |
| lọc dầu mazda | 2390.04 | 4984.860000000001 | 15 | 24.1 | 3 | 3 |
| giảm xóc toyota | 2348.05 | 4976.99 | 14 | 51.7 | 3 | 6 |
| đèn hậu kia | 4517.29 | 5784.130000000001 | 15 | 138.0 | 3 | 6 |
| 04465-0D140 | 1705.3 | 1704.43 | 2 | 0.1 | 0 | 0 |

---

## Top 10 bottlenecks (ranked, production critical path)

| Rank | Consumer | Avg ms | % of ~1537ms preview path |
|------|----------|--------|---------------------------|
| 1 | **Preview group SQL** (category+vehicle GROUP BY, no LIMIT) | 960 | **62%** |
| 2 | **Preview product SQL** (3× `getProductList` in parallel) | 581 | **38%** |
| 3 | Vehicle fitment JOIN (`pa` + `cm`) in group SQL | ~400* | ~26%* |
| 4 | `COUNT(DISTINCT p.id)` per preview group | ~390×3 | ~25%* |
| 5 | Product SELECT per preview group | ~475×3 | ~30%* |
| 6 | Category sidebar SQL (parallel, often hidden) | 960 | — |
| 7 | Category ranking + `getModels` (brand-only) | 138 | — |
| 8 | Preview group ranking (JS) | 73 | <5% |
| 9 | Schema column introspection (cold) | 44 | cold only |
| 10 | JSON serialization | 0.5 | <1% |

\*Estimated from per-query EXPLAIN ANALYZE + SQL log; fitment join nested inside group SQL plan.

---

## SQL profile — Preview group query (`bugi toyota` sample)

| Metric | Value |
|--------|-------|
| Execution time (EXPLAIN ANALYZE) | **~933ms** |
| Rows examined (plan) | **7397** products scanned (table scan on `p`) |
| Intermediate rows (pre-GROUP BY) | **37** |
| Rows returned (groups) | **19** |
| Filesort | no |
| Temp table | no |
| JOIN count (plan) | 6 |

**Shape:** `FROM products p` → LEFT JOIN `product_category_map`, `product_categories`, `product_car_applications`, `car_models` → JOIN `shops` → keyword LIKE filters → **GROUP BY** canonical category + `cm.hang_xe` + `cm.ten_xe` → HAVING count > 0. **No LIMIT** on aggregation query.

<details>
<summary>EXPLAIN ANALYZE excerpt (preview group SQL)</summary>

```
-> Filter: (total_count > 0)  (actual time=933..933 rows=19 loops=1)
    -> Group aggregate: max(car_models.hang_xe), max(car_models.ten_xe), count(distinct products.id), max(tmp_field)  (actual time=933..933 rows=19 loops=1)
        -> Sort: canonical_name, canonical_slug, cm.hang_xe, cm.ten_xe  (actual time=933..933 rows=37 loops=1)
            -> Stream results  (cost=3999 rows=1426) (actual time=542..933 rows=37 loops=1)
                -> Nested loop inner join  (cost=3999 rows=1426) (actual time=542..933 rows=37 loops=1)
                    -> Nested loop inner join  (cost=3499 rows=1426) (actual time=17.7..932 rows=87 loops=1)
                        -> Nested loop left join  (cost=3000 rows=1223) (actual time=17.7..932 rows=54 loops=1)
                            -> Nested loop inner join  (cost=2572 rows=1223) (actual time=17.7..931 rows=54 loops=1)
                                -> Nested loop left join  (cost=2144 rows=1223) (actual time=17.6..931 rows=54 loops=1)
                                    -> Nested loop left join  (cost=1716 rows=1223) (actual time=17.6..931 rows=54 loops=1)
                                        -> Filter: (((lower(p.partName) like '%bugi%') or (lower(p.shortDescription) like '%bugi%') or (lower(p.`description`) like '%bugi%') or (lower(p.partNumber) like '%bugi%')) and (trim(lower(p.moderation_status)) = 'approved') and (p.stock > 0) and (p.shopId is not null))  (cost=1288 rows=1223) (actual time=17.6..930 rows=54 loops=1)
                                            -> Table scan on p  (cost=1288 rows=3669) (actual time=0.294..46.4 rows=7397 loops=1)
                                        -> Covering index lookup on pcm using uk_product_category (product_id=p.id)  (cost=0.25 rows=1) (actual time=0.016..0.0169 rows=1 loops=54)
                                    -> Single-row index lookup on pc using PRIMARY (id=pcm.category_id)  (cost=0.25 rows=1) (actual time=0.00558..0.00561 rows=1 loops=54)
                                -> Filter: (trim(lower(s.public_status)) = 'public')  (cost=0.25 rows=1) (actual time=0.00268..0.00279 rows=1 loops=54)
                                    -> Single-row index lookup on s using PRIMARY (id=p.shopId)  (cost=0.25 rows=1) (actual time=0.00127..0.00131 rows=1 loops=54)
                            -> Single-row covering index lookup on a using PRIMARY (id=s.provinceId)  (cost=0.25 rows=1) (actual time=0.00124..0.00128 rows=1 loops=54)
                        -> Index lookup on pa using fk_pca_product (productId=p.id)  (cost=0.292 rows=1.17) (actual time=0.0117..0.0135 rows=1.61 loops=54)
                    -> Filter: (lower(trim(cm.hang_xe)) = 'toyota')  (cost=0.25 rows=1) (actual time=0.00512..0.00517 rows=0.425 loops=87)
                        -> Single-row index lookup on cm using PRIMARY (id=pa.carModelId)  (cost=0.25 rows=1) (actual time=0.00403..0.00407 rows=1 loops=87)

```
</details>

---

## SQL profile — Category sidebar query (`bugi toyota` sample)

| Metric | Value |
|--------|-------|
| Execution time (EXPLAIN ANALYZE) | **~832ms** |
| Rows returned (categories) | **6** |
| Filesort | no |
| Temp table | no |

**Shape:** Same product listing joins (vehicle join when scope has brand/model/year) → **GROUP BY category only** (no vehicle dimension).

---

## SQL profile — Preview product queries (largest cost)

Each top-3 group triggers **one `getProductList`** call, which runs **in parallel**:

| Sub-query | Per group | Typical rows returned |
|-----------|-----------|----------------------|
| `selectProductListRows` | 1 | 16 (LIMIT) |
| `countProductList` | 1 | 1 |
| `selectPrimaryImagesForProducts` | 1 | ≤16 |
| `loadPrimaryFitmentCarsByProductIds` | 1 | ≤16 |

**3 groups → ~12 SQL round-trips** for preview products alone (before listing cache).

| Metric (avg across queries) | Value |
|-----------------------------|-------|
| Preview product SQL (3× parallel wall) | 581ms |
| Preview group SQL | 960ms |
| Category SQL (parallel, hidden) | 960ms |
| Avg SQL queries per request | 11.9 |

**Vehicle fitment join cost:** Preview group SQL **always** joins `product_car_applications` + `car_models` (GROUP BY vehicle). Category SQL joins fitment only when listing scope includes brand/model/year.

---

## Object allocation (average)

| Metric | Avg |
|--------|-----|
| Category+vehicle group rows (pre-rank) | 237.7 |
| Top groups used | 3 |
| Products fetched (pre-dedupe) | 11.7 |
| Products returned (post-dedupe) | 4.3 |
| Products discarded/deduped | 0.3 |
| Categories returned | 129.4 |
| JSON payload size | 47.6 KB |
| Heap delta (per staged run) | 1.48 MB |

---

## Node.js profiling summary

| Component | Observation |
|-----------|-------------|
| CPU time | Ranking, dedupe, URL building < 5ms combined — negligible vs DB |
| Async waiting | Dominated by MySQL pool (`pool.query`) |
| DB waiting | **~99%** of preview critical path |
| JSON serialization | ~0.47ms avg — negligible |
| In-process listing cache | `getProductList` uses 60s TTL `getOrSetCache` — warms after first identical facet query |

---

## HTTP load test (`bugi toyota`)

| Requests | Avg ms | P50 ms | P95 ms | Max ms |
|----------|--------|--------|--------|--------|
| 10 | 1010.71 | 905.31 | 1567.23 | 1567.23 |
| 20 | 1010.63 | 976.42 | 1205.32 | 1214.15 |
| 50 | 1006.79 | 980.13 | 1123.59 | 1466.41 |
| 100 | 1012.6 | 1001.02 | 1166.9 | 1709.7 |

> Repeated identical requests benefit from **listing cache** (60s) and connection reuse; first request in each batch is coldest.

---

## Timeline (`bugi toyota` representative)

```
0ms ────────────────────────────────────────────────────► ~1640ms (HTTP cold)
│ parse+scope (0.3ms)
│ ├─ [PARALLEL] preview branch ─────────────────── ~1550ms ◄ critical path
│ │    ├─ group SQL ─────────────── 903ms
│ │    ├─ ranking ───────────────── 22ms
│ │    └─ 3× product list SQL ───── 581ms (parallel wall)
│ └─ [PARALLEL] category branch ─────────────────── ~868ms (overlapped)
│ assembly + JSON ────────────────── 3ms
```

---

## Optimization candidates (audit only — NOT implemented)

1. **Collapse 3× `getProductList` into one batch query** — largest win; eliminates ~9–12 SQL round-trips per request.
2. **Add LIMIT to preview group aggregation** — full GROUP BY over all matching products×vehicles before JS ranking slices to 3.
3. **Materialized category×vehicle counts** — avoid heavy GROUP BY on every keystroke.
4. **Share work between preview group SQL and category SQL** — both scan similar product sets today.
5. **Reduce per-product fitment/image fetches** — secondary queries per group add latency even with cache.
6. **Connection/query concurrency cap** — 3 parallel `getProductList` × 4 sub-queries stresses pool under load.

---

## Raw data

- `audit/search-backend-profiling-01/profile-data.json`

---

**SEARCH-BACKEND-PROFILING-01** — measurement complete, no code changes.
