# SEARCH-PRODUCTION-STABILIZATION-01

**Date:** 2026-06-27  
**Mode:** Read-only health audit (no search logic changes)  
**Runtime:** `InvertedSearchRuntime` (Search V2, post-cutover)

---

## Executive summary

Search V2 production health is **GREEN** in the initial post-cutover window.

| Check | Result |
|-------|--------|
| Latency P50 / P90 / P95 / P99 | **173 / 287 / 337 / 389 ms** |
| Queries >1000 ms | **0 / 45** |
| Search runtime errors | **None** |
| Unhandled rejections | **None** |
| Token index coverage | **100%** (7,385 products) |
| Missing tokens | **0** |
| Dead products in index | **0** |
| Broken URLs | **0** |
| Sync failures (logs) | **None** |
| Memory / CPU | **Normal** (~56 MB RSS, 0.3% CPU) |

Legacy-slow queries (đèn hậu Kia, lọc dầu Mazda) now respond in **~200–320 ms** vs **1.8–3.8 s** pre-cutover.

---

## Latency percentiles

Production benchmark: 15-query corpus × 3 runs → 45 requests to `https://otofine.com/api/search/suggest`.

| Percentile | TTFB |
|------------|------|
| **P50** | 173 ms |
| **P90** | 287 ms |
| **P95** | 337 ms |
| **P99** | 389 ms |

---

## Slowest queries

1. đèn hậu + Kia — 323 ms avg (was 3,847 ms legacy)
2. lọc gió + Toyota — 300 ms
3. má phanh + Vios — 268 ms

**No query exceeded 1000 ms.**

---

## Runtime & errors

- `SEARCH_RUNTIME=inverted` confirmed in `.env` and `getSearchRuntime()`.
- PM2 `otofine-backend` online; ~8 min uptime at audit (post cutover).
- Error log: 1 historical sitemap DB error only; **no search errors**.

---

## Index health

| Table | Coverage |
|-------|----------|
| `search_token_index` | 7,385 / 7,385 active products (**100%**) |
| `product_search_index` | 8,602 rows, 7,385 distinct products |
| Missing tokens | 0 |
| Orphan tokens | 0 |
| Broken paths | 0 |

---

## Popup parity

Production stack includes `quality_gate_v2`. Validated popup parity **100%** ([SEARCH-GROUPING-PARITY-01](../SEARCH-GROUPING-PARITY-01.md)). Not re-run live in this audit.

---

## No-result queries (fast, valid)

- `brake pad` (~141 ms avg)
- `04465-0D140` (~107 ms)
- `ấm sắc` + Toyota (~130 ms)

---

## Deliverables

| File | Contents |
|------|----------|
| [production-health.md](./production-health.md) | Full health dashboard |
| [slow-query-report.md](./slow-query-report.md) | Slowest queries + >1s check |
| [runtime-errors.md](./runtime-errors.md) | PM2 error analysis |
| [memory.md](./memory.md) | Memory & CPU |
| [recommendations.md](./recommendations.md) | Monitoring & next steps |
| [latency-benchmark.json](./latency-benchmark.json) | Raw 45-request sample |

---

## Verdict

**Search V2 is production-stable** in initial metrics. Recommend 72 h log watch and P95 latency alerting. No implementation changes required from this audit.
