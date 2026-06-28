# Before / After Latency — SEARCH-PRODUCTION-CUTOVER-01

**Cutover:** 2026-06-27  
**Endpoint:** `GET https://otofine.com/api/search/suggest`  
**Before runtime:** LegacySearchRuntime  
**After runtime:** InvertedSearchRuntime  

---

## Summary table

| Query | Before TTFB | After TTFB | Δ TTFB | Before bytes | After bytes | Δ bytes |
|-------|-------------|------------|--------|--------------|-------------|---------|
| bugi + Toyota | 323 ms | 156 ms | **−52%** | 7,888 | 7,467 | −5% |
| đèn hậu + Kia | **3,847 ms** | **507 ms** | **−87%** | **101,233** | **17,736** | **−82%** |
| má phanh + Vios | 318 ms | 410 ms | +29% | 10,306 | 9,938 | −4% |
| lọc dầu + Mazda | **1,775 ms** | **494 ms** | **−72%** | 3,058 | 4,057 | +33% |

TTFB = curl `time_starttransfer` (server processing + TLS). Single sample each; sufficient to confirm runtime switch on slow legacy queries.

---

## Per-query notes

### bugi toyota
- Fast on both runtimes (~300 ms legacy, ~150 ms inverted).
- Group count unchanged (3). Category count after: 6.

### đèn hậu kia (strongest signal)
- Legacy: **3.8 s** TTFB, **101 KB** JSON — characteristic of legacy products-table grouping scan.
- Inverted: **0.5 s** TTFB, **18 KB** JSON, 84 sidebar categories (quality-gated vs legacy’s hundreds).
- Confirms InvertedSearchRuntime + `quality_gate_v2` active in production.

### má phanh vios
- Similar latency both sides (~300–410 ms). Category count after: **14** (matches parity target vs legacy 135 ungated groups).

### lọc dầu mazda
- Legacy LIKE-fallback path: **1.8 s** → inverted **0.5 s** (−72%).
- Slightly larger JSON after (+33%) due to more category rows in sidebar (13 vs 2 legacy), not latency regression.

---

## Local PM2 confirmation (same process)

After restart, `http://127.0.0.1:5000/api/search/suggest?query=den+hau&brand=Kia`:

| Metric | Value |
|--------|-------|
| TTFB | 232 ms |
| Body | 17,736 bytes |
| Categories | 84 |

Matches production-after payload signature — PM2 `otofine-backend` serving inverted.

---

## Raw data

- [before-latency.json](./before-latency.json)
- [after-latency.json](./after-latency.json)
