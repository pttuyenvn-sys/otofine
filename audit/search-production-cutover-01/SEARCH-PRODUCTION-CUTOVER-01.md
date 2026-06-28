# SEARCH-PRODUCTION-CUTOVER-01

**Status:** **COMPLETE**  
**Date:** 2026-06-27  
**Scope:** Configuration-only activation of Search V2 (inverted runtime). No search logic changes.

---

## Objective

Switch production from `LegacySearchRuntime` to `InvertedSearchRuntime` with the validated flag stack.

---

## Changes made

**File:** `backend/.env` (append)

```env
# SEARCH-PRODUCTION-CUTOVER-01 — Search V2 (inverted runtime)
SEARCH_RUNTIME=inverted
SEARCH_CANDIDATE_POLICY=adaptive
SEARCH_RANKING_MODE=weighted_v2
SEARCH_GROUPING_MODE=quality_gate_v2
SEARCH_INVERTED_INDEX=1
```

**Deploy:**

```bash
pm2 restart otofine-backend
```

---

## Verification summary

| Check | Result |
|-------|--------|
| `getSearchRuntime()` → `InvertedSearchRuntime` | **PASS** |
| PM2 `otofine-backend` restarted | **PASS** |
| `GET /api/search/suggest` live | **PASS** |
| Legacy no longer serving (signature change on đèn hậu) | **PASS** |

Production search **no longer executes `LegacySearchRuntime`**. It executes **`InvertedSearchRuntime`**.

Details: [runtime-verification.md](./runtime-verification.md)

---

## Latency before / after

| Query | Before (legacy) | After (inverted) | Change |
|-------|-----------------|------------------|--------|
| bugi toyota | 323 ms | 156 ms | −52% |
| đèn hậu kia | 3,847 ms | 507 ms | **−87%** |
| má phanh vios | 318 ms | 410 ms | +29% |
| lọc dầu mazda | 1,775 ms | 494 ms | −72% |

Full analysis: [before-after-latency.md](./before-after-latency.md)

The largest win is on queries that previously hit legacy LIKE/grouping SQL (đèn hậu, lọc dầu). Payload size for đèn hậu dropped from **101 KB → 18 KB**, confirming inverted + quality-gated grouping.

---

## Rollback instructions

If Search V2 must be reverted:

1. Edit `/var/www/otofine/backend/.env` — remove or replace the cutover block:

```env
SEARCH_RUNTIME=legacy
# Remove or set off:
# SEARCH_CANDIDATE_POLICY=strict
# SEARCH_RANKING_MODE=legacy
# SEARCH_GROUPING_MODE=legacy
# SEARCH_INVERTED_INDEX=0
```

Minimal rollback (restores legacy behavior; sub-flags ignored when runtime is legacy):

```env
SEARCH_RUNTIME=legacy
```

2. Restart:

```bash
pm2 restart otofine-backend
```

3. Verify:

```bash
cd /var/www/otofine/backend && node --input-type=module -e "
import 'dotenv/config';
import { getSearchRuntime } from './services/search/runtime/searchRuntime.js';
import { LegacySearchRuntime } from './services/search/runtime/LegacySearchRuntime.js';
import { resetSearchRuntimeCache } from './services/search/runtime/searchRuntime.js';
resetSearchRuntimeCache();
process.exit(getSearchRuntime() === LegacySearchRuntime ? 0 : 1);
"
```

4. Smoke test — đèn hậu should return to legacy latency profile (~3–5 s TTFB, ~100 KB JSON):

```bash
curl -s -o /dev/null -w 'ttfb:%{time_starttransfer}s size:%{size_download}\n' \
  'https://otofine.com/api/search/suggest?query=den+hau&brand=Kia'
```

Expected after rollback: ttfb >2 s, size >50 KB.

---

## Deliverables

| File | Contents |
|------|----------|
| [runtime-verification.md](./runtime-verification.md) | Runtime selector + live HTTP proof |
| [before-after-latency.md](./before-after-latency.md) | Latency comparison table |
| [verification-checklist.md](./verification-checklist.md) | Step-by-step checklist |
| [before-latency.json](./before-latency.json) | Raw before samples |
| [after-latency.json](./after-latency.json) | Raw after samples |

---

## Notes

- Frontend unchanged — still calls `GET /api/search/suggest`.
- `SEARCH_CANARY` left off (not required for cutover).
- Index tables were already populated (`product_search_index` 8,602 active; `search_token_index` 352k rows). No reindex was required for cutover.
- Monitor suggest quality on production query sample; parity audits noted Top10 98.57% (not 99%+) — acceptable per cutover request to activate validated stack.
