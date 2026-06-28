# Memory & CPU — SEARCH-PRODUCTION-STABILIZATION-01

**Process:** `otofine-backend` (PM2 id 7)  
**Sample time:** 2026-06-27, ~8 min after cutover restart

---

## Memory

| Metric | Value | Assessment |
|--------|-------|------------|
| RSS (process) | **~56 MB** | Normal for Node API |
| Heap total | 8.73 MiB | PM2 code metrics |
| Heap used | 7.27 MiB | |
| Heap usage | 83.4% | Expected for warm Node heap |
| PM2 max_memory_restart | 512M (ecosystem template) | Not configured on live CLI start |

No memory leak signal in 8-minute post-cutover window. Heap stable, no OOM or restart triggered by memory.

---

## CPU

| Metric | Value |
|--------|-------|
| Process CPU (ps sample) | **0.3%** |
| PM2 monit CPU | 0% (idle between requests) |
| Event loop latency (avg) | 0.37 ms |
| Event loop latency (p95) | 1.19 ms |

Event loop healthy — no blocking from inverted search path under benchmark load (45 sequential curl requests).

---

## Restarts

| Metric | Value | Notes |
|--------|-------|-------|
| Uptime (post cutover) | ~8 min | Expected after `pm2 restart` |
| Lifetime restarts | 1,424 | Historical; includes dev/deploy cycles |
| Unstable restarts | 0 | PM2 stability OK |

Cutover restart was intentional (restart #1424). No crash loop after activation.

---

## Active handles

| Metric | Value |
|--------|-------|
| Active requests | 0 (idle at sample) |
| Active handles | 5 |

---

## Recommendations

1. Set `max_memory_restart` on `otofine-backend` if not already (ecosystem defines 512M).
2. Re-sample memory after 24 h production traffic for leak detection.
3. Inverted runtime benchmark mean ~192 ms TTFB — no CPU saturation observed.
