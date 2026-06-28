# SEARCH-QUERY-PLAN-AUDIT-01

**Date:** 2026-06-26  
**Mode:** READ-ONLY — no code/SQL/index/cache changes  
**MySQL:** 8.0.44-0ubuntu0.22.04.2  
**Test query:** `bugi` + brand `Toyota`

---

## Executive answer

**Why did 2 SQL become slower than ~900ms when the old path used 11–17 SQL?**

Because the **~900ms warm latency was never “17 sequential queries.”** It was:

1. **Parallel execution** — category SQL and preview-group SQL ran in `Promise.all` (wall = **max**, not sum).
2. **60s listing in-process cache** on `getProductList` — warm preview product fetches often skipped the DB entirely.
3. **Sequential phases hidden by parallelism** — category work overlapped preview-group work.

The new path runs **two always-cold, always-sequential heavyweight statements** with **no listing cache**:

| Path | Measured wall (this audit) |
|------|---------------------------|
| Old: category ∥ preview group | **1009ms** (parallel) |
| Old: 3× (COUNT + SELECT) products | **1984ms** (parallel, no cache) |
| Old full preview branch (sequential) | **967 + 1984 ≈ 2951ms** cold |
| Old warm HTTP (with cache) | **~900ms** (documented pre-optimization) |
| **New: unified CTE + batch preview** | **843 + 916 = 1822ms** sequential |

**The optimization reduced query count but removed parallelism and cache hits.** Measured DB time for the new path (~1822ms) is **faster than the old cold DB path (~2951ms)** but **slower than the old warm cached path (~900ms)**.

---

## Timeline

### A — Previous (`bugi toyota`)

```
0ms ───────────────────────────────────────────────────────────────► ~900ms warm / ~2950ms cold DB
│
├─ Promise.all ───────────────────────────────────────── max=1009ms
│    ├─ Category SQL ─────────────── ~924ms
│    └─ Preview group SQL ────────── ~967ms
│
├─ rankSearchPreviewGroups (JS, <25ms)
│
└─ Promise.all ×3 getProductList ─────────────────────── ~1984ms cold
     │  (warm: ~0–50ms via 60s listing cache)
     ├─ COUNT DISTINCT per group (~860ms each, parallel)
     ├─ SELECT LIMIT 16 per group (~920ms each, parallel)
     ├─ images batch
     └─ fitment batch
```

### B — Current

```
0ms ───────────────────────────────────────────────────────────────► 1822ms (always)
│
├─ Unified CTE SQL ─────────────────────────────────────── 843ms
│    ├─ Materialize CTE `matched` (DISTINCT + temp dedup) ~916ms in plan
│    ├─ GROUP BY vehicle (19 groups)
│    └─ UNION ALL → GROUP BY category (6 groups, reuses materialized CTE)
│
└─ Batch preview SQL ─────────────────────────────────── 916ms
     ├─ Full join scan + group OR filter (3 groups)
     ├─ LATERAL fitment (materialize per row)
     ├─ Correlated image subquery (per row)
     └─ ROW_NUMBER window + materialize
```

---

## Measured timings (identical query, same server)

| Label | Wall time |
|-------|-----------|
| `A_old_category_sql` | 924ms |
| `A_old_preview_group_sql` | 967ms |
| `A_old_category_parallel_preview_group` | **1009ms** |
| `A_old_3x_count_plus_select_parallel` | **1984ms** |
| `B_new_unified_cte_sql` | **843ms** |
| `B_new_batch_preview_sql` | **916ms** |
| `B_new_both_sequential` | **1822ms** |

---

## EXPLAIN ANALYZE — plan comparison

| Query | Root actual time | Table scan on `p` | Rows after LIKE filter | Materialize | Temp table | Sort | Nested loops |
|-------|------------------|-------------------|------------------------|-------------|------------|------|--------------|
| A old category | **905ms** | 7397 examined → 54 | 54 | no | no | yes | 6 |
| A old preview group | **905ms** | 7397 → 54 → 37 pre-GROUP | 19 out | no | no | yes | 6 |
| B new unified CTE | **916ms** | 7397 → 54 → 37 distinct tuples | 25 out (19+6) | **yes** | **yes (dedup)** | yes | 6 |
| B new batch preview | **874ms** | 7397 → 54 → 13 final | 13 | **yes** | no | yes | 8 |
| B CTE matched only | **916ms** | same | 37 tuples | **yes** | **yes** | no | 6 |

**Full untruncated plans:** `audit/search-query-plan-audit-01/*.explain.txt`

---

## PART 4 — CTE materialization (evidence)

MySQL **materializes** the `matched` CTE. From `B_new_unified_cte_sql.explain.txt`:

```
-> Materialize CTE matched if needed  (actual time=916..916 rows=37 loops=1)
    -> Table scan on <temporary>
        -> Temporary table with deduplication  (actual time=916..916 rows=37 loops=1)
            -> Nested loop inner join ... Table scan on p (7397 rows) → 54 → 87 → 37
```

The **second UNION ALL branch** reuses the materialized CTE:

```
-> Table scan on matched  (actual time=0.00983..0.0193 rows=37 loops=1)
    -> Materialize CTE matched if needed (never executed)
```

**Conclusion:** CTE is **materialized once** (~916ms), not inlined. Cost is paid **up front** before any aggregation. Old preview SQL went **directly** to `Group aggregate: count(distinct products.id)` without a prior `SELECT DISTINCT` + temp dedup step.

---

## PART 5 — JOIN row expansion (`bugi toyota`)

From EXPLAIN ANALYZE (both old and new share the same join spine):

| Stage | Rows (actual) |
|-------|---------------|
| Table scan `products` | **7397 examined** |
| After LIKE + visibility filter on `p` | **54** |
| After `pcm`/`pc` join | **54** |
| After `pa`/`cm` fitment join | **87** (1.61 fitment rows/product) |
| After Toyota brand filter on `cm` | **37–40** (varies by query shape) |
| DISTINCT tuples in CTE `matched` | **37** |
| Vehicle groups out | **19** |
| Category groups out | **6** |

**LIKE filter:** Applied **on `products` before join expansion** (filter node directly above table scan). Not deferred until after fitment join.

---

## PART 6 — GROUP BY cost

| | Old preview group | New unified (vehicle branch) |
|--|-------------------|------------------------------|
| Input rows | 37 (from join, no prior DISTINCT) | 37 (from **materialized** CTE) |
| Aggregate | `count(distinct p.id)` on join output | `count(distinct product_id)` on CTE |
| Extra step | none | **SELECT DISTINCT → temp dedup table** |
| Plan time | **905ms** | **916ms** (CTE build) + **0.2ms** (category branch on cached CTE) |

The GROUP BY itself is not the regression — the **pre-aggregate DISTINCT materialization** is new overhead at similar join scale.

---

## PART 7 — UNION ALL cost

`UNION ALL` adds an **Append** node with two children:

1. Vehicle `GROUP BY` — **916ms** (includes CTE materialization)
2. Category `GROUP BY` — **~0.2ms** (scans already-materialized `matched`, 37 rows)

UNION merge cost is negligible; the cost is **forcing both grains through one sequential statement** where category SQL previously ran **in parallel** and did not block the preview branch.

---

## PART 8 — COUNT(DISTINCT)

Present in **all** aggregation paths:

- Old: `count(distinct products.id)` in Group aggregate
- New: `count(distinct matched.product_id)` ×2

`COUNT(DISTINCT)` is **not new**; it is not the primary regression. The new **`SELECT DISTINCT` before GROUP** is the additional distinct operation.

---

## PART 9 — LIKE selectivity

```
Table scan on p  (actual time=0.059..35.7 rows=7397 loops=1)
  → Filter: lower(p.partName) LIKE '%bugi%' OR ...  (rows=54 loops=1)
```

- **7397** products scanned  
- **54** pass keyword + stock + moderation filter  
- Selectivity: **0.73%**  
- **No index used** for LIKE prefix (leading wildcard)

Both old and new paths share this bottleneck.

---

## PART 10 — Optimizer choices

| Observation | Evidence |
|-------------|----------|
| Products access | **Table scan** on `p` (cost=1288, rows=3669 estimated, 7397 actual) |
| Category map | **Covering index** `uk_product_category (product_id)` |
| Fitment | **Index** `fk_pca_product (productId)` |
| Car models | **PRIMARY** lookup on `cm.id` |
| Brand filter | Applied **after** fitment join (`lower(trim(cm.hang_xe)) = 'toyota'`) |
| CTE strategy | **Materialize** + temp dedup (not inline) |
| Batch preview | **Materialize** entire window result before `rn <= 12` filter |

---

## PART 11 — Root cause ranking (with evidence)

| Rank | Root cause | Evidence |
|------|------------|----------|
| **1** | **Removed 60s listing cache** on preview products | Old warm ~900ms; old 3× product SQL cold 1984ms; new batch always ~916ms |
| **2** | **Removed parallelism** | Old top-level `Promise.all`: 1009ms not 1891ms; new forced sequential 1822ms |
| **3** | **CTE DISTINCT materialization** | Plan: `Temporary table with deduplication` 916ms; old had direct Group aggregate |
| **4** | **Two sequential mega-queries** | 843ms + 916ms; no overlap between inventory and preview |
| **5** | **Batch preview still full join** | 874ms plan; table scan 7397 + LATERAL + image subquery + window sort |
| **6** | **Category work moved onto critical path** | Was parallel-hidden (~924ms); now inside 843ms unified query |
| **7** | **LIKE table scan** (unchanged) | 7397 rows examined both versions |

---

## PART 12 — Scalability projection (from plan shape)

| Catalog size | Old warm (cache + parallel) | Old cold DB | New sequential |
|--------------|----------------------------|-------------|----------------|
| **7k** (now) | ~900ms | ~2950ms | **1822ms** measured |
| **100k** | cache masks product fetch | O(n) scan + 3× parallel lists | O(n) scan + CTE materialize + batch window |
| **300k** | same | parallel helps group phase | **no parallel**; CTE rows ∝ matches×fitments |
| **1M** | cache miss catastrophic | 17 queries still parallelizable | **2 serial** heavy queries |

Complexity driver: **`Table scan on p`** loops = product count; CTE adds **O(matches × fitments)** materialized tuples before GROUP.

---

## Rows flow diagram

```
products (7397 scanned)
    │ LIKE '%bugi%' filter ON p
    ▼
54 rows
    │ LEFT JOIN pcm → pc
    ▼
54 rows
    │ JOIN shops, address
    ▼
54 rows
    │ LEFT JOIN pa → cm (fitment)
    ▼
87 rows  (1.61 fitments/product)
    │ brand = Toyota filter
    ▼
37–40 rows
    │
    ├─[OLD]──► GROUP BY cat+vehicle ──► 19 groups (905ms)
    │
    └─[NEW]──► SELECT DISTINCT ──► temp dedup table (37 tuples, 916ms)
                    │
                    ├─► GROUP BY vehicle ──► 19 groups
                    └─► GROUP BY category ──► 6 groups
```

---

## Artifacts

| File | Contents |
|------|----------|
| `audit/search-query-plan-audit-01/A_old_category_sql.explain.txt` | Full EXPLAIN ANALYZE |
| `audit/search-query-plan-audit-01/A_old_preview_group_sql.explain.txt` | Full EXPLAIN ANALYZE |
| `audit/search-query-plan-audit-01/B_new_unified_cte_sql.explain.txt` | Full EXPLAIN ANALYZE |
| `audit/search-query-plan-audit-01/B_new_batch_preview_sql.explain.txt` | Full EXPLAIN ANALYZE |
| `audit/search-query-plan-audit-01/cte-format-tree.txt` | FORMAT=TREE |
| `audit/search-query-plan-audit-01/audit-data.json` | Machine-readable summary |

Re-run: `node audit/search-query-plan-audit-01.mjs`

---

**SEARCH-QUERY-PLAN-AUDIT-01** — read-only. No fixes applied.
