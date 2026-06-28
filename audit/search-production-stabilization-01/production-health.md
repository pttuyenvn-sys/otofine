# Production health — SEARCH-PRODUCTION-STABILIZATION-01

**Audit date:** 2026-06-27 (post cutover ~8 min uptime at sample time)  
**Runtime:** `InvertedSearchRuntime` (confirmed)  
**Mode:** Read-only

---

## Overall status: **HEALTHY**

| Area | Status | Notes |
|------|--------|-------|
| Runtime active | OK | `SEARCH_RUNTIME=inverted` |
| Suggest latency | OK | P95 **337 ms**, max **389 ms** (45 samples) |
| Queries >1000 ms | OK | **0** observed |
| HTTP errors | OK | 45/45 returned 200 |
| Search runtime errors (PM2) | OK | None in recent logs |
| Unhandled rejections | OK | None found |
| Memory | OK | ~56 MB RSS, heap 7.3 MiB |
| CPU | OK | ~0.3% at idle/sample |
| Token index coverage | OK | **100%** of active products (7,385/7,385) |
| PSI coverage | OK | 7,385 distinct products, 8,602 index rows |
| Missing tokens | OK | **0** active PSI without tokens |
| Dead products in index | OK | **0** |
| Broken canonical paths | OK | **0** |
| Sync failures (log) | OK | No search sync errors in PM2 logs |

---

## Latency percentiles (production suggest)

**Endpoint:** `GET https://otofine.com/api/search/suggest`  
**Sample:** 15 queries × 3 runs = 45 requests

| Percentile | TTFB (ms) |
|------------|-----------|
| P50 | **173** |
| P90 | **287** |
| P95 | **337** |
| P99 | **389** |
| Mean | 192 |
| Min | 101 |
| Max | 389 |

Compare to pre-cutover legacy (same 4-query set):

| Query | Legacy | Post-cutover (stabilization) |
|-------|--------|------------------------------|
| đèn hậu Kia | 3,847 ms | **323 ms** avg |
| lọc dầu Mazda | 1,775 ms | **194 ms** avg |
| bugi Toyota | 323 ms | **157 ms** avg |
| má phanh Vios | 318 ms | **268 ms** avg |

---

## Slowest queries (avg TTFB, 3-run benchmark)

| Rank | Query | Avg ms |
|------|-------|--------|
| 1 | đèn hậu + Kia | 323 |
| 2 | lọc gió + Toyota | 300 |
| 3 | má phanh + Vios | 268 |
| 4 | giảm xóc + Ford | 228 |
| 5 | bố thắng | 225 |

None exceeded 1000 ms.

---

## No-result queries (valid empty responses)

| Query | TTFB | Notes |
|-------|------|-------|
| brake pad | ~124–150 ms | Fast empty; legacy also sparse |
| 04465-0D140 | ~101–114 ms | Part not in catalog |
| ấm sắc + Toyota | ~120–150 ms | No matching inventory |

Empty responses return minimal JSON (~116–132 bytes) quickly — not a timeout or error.

---

## Index & data health

| Metric | Value |
|--------|-------|
| Active approved in-stock products | 7,385 |
| `product_search_index` active rows | 8,602 |
| Distinct products in PSI | 7,385 |
| Avg index rows per product | ~1.16 |
| `search_token_index` distinct products | 7,385 |
| Total token rows | 352,631 |
| Avg tokens per product | 47.7 |
| Active PSI without tokens | **0** |
| Orphan tokens (no active PSI) | **0** |
| Dead/stale products in active index | **0** |
| Broken `canonical_path` | **0** |

**Token coverage:** 100% of sellable products have inverted tokens.

---

## Popup parity (production config)

Production runs `SEARCH_GROUPING_MODE=quality_gate_v2`. Pre-cutover validation ([SEARCH-GROUPING-PARITY-01](../SEARCH-GROUPING-PARITY-01.md)):

- **Popup parity: 100%** (quality_gate_v2 vs legacy)
- **ViewAll parity: 100%**
- Top10 parity: 98.57% (ranking-limited, unchanged by cutover)

No live A/B re-run in this audit; parity inferred from validated stack + healthy suggest responses on canary corpus queries.

---

## PM2 process

| Metric | Value |
|--------|-------|
| Process | `otofine-backend` |
| Status | online |
| Uptime at audit | ~8 min (post cutover restart) |
| Historical restarts | 1,424 (lifetime; not cutover-specific) |
| Unstable restarts | 0 |
| RSS | ~56 MB |
| Heap used | 7.27 MiB / 8.73 MiB (83%) |
| Event loop p95 | 1.19 ms |

---

## Raw data

- [latency-benchmark.json](./latency-benchmark.json)
