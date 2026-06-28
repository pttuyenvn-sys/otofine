# Verification checklist — SEARCH-PRODUCTION-CUTOVER-01

**Cutover date:** 2026-06-27

---

## Pre-cutover

- [x] Baseline latency captured (4 queries, production URL)
- [x] Confirmed no existing `SEARCH_*` in `.env`
- [x] Documented rollback procedure

## Configuration

- [x] `SEARCH_RUNTIME=inverted`
- [x] `SEARCH_CANDIDATE_POLICY=adaptive`
- [x] `SEARCH_RANKING_MODE=weighted_v2`
- [x] `SEARCH_GROUPING_MODE=quality_gate_v2`
- [x] `SEARCH_INVERTED_INDEX=1`
- [x] No search logic / ranking / candidate / grouping code changes

## Runtime verification

- [x] `getSearchRuntimeMode()` returns `inverted`
- [x] `getSearchRuntime() === InvertedSearchRuntime`
- [x] `getSearchRuntime() !== LegacySearchRuntime`
- [x] Sub-flags read correctly (adaptive, weighted_v2, quality_gate_v2, inverted index on)

## Deployment

- [x] `pm2 restart otofine-backend` completed
- [x] Process online with new PID

## Live request verification

- [x] `GET /api/search/suggest?query=bugi&brand=Toyota` → 200, valid JSON
- [x] `GET /api/search/suggest?query=den+hau&brand=Kia` → inverted signature (17 KB, ~0.5 s vs legacy 101 KB / 3.8 s)
- [x] Local PM2 response matches production-after inverted signature

## Post-cutover latency

- [x] bugi toyota — measured
- [x] đèn hậu kia — measured (major improvement)
- [x] má phanh vios — measured
- [x] lọc dầu mazda — measured

## Failures

- [ ] None — cutover did not stop

---

## Rollback checklist (if needed)

- [ ] Remove or comment Search V2 block in `backend/.env`
- [ ] Set `SEARCH_RUNTIME=legacy` (or delete line)
- [ ] `pm2 restart otofine-backend`
- [ ] Verify `getSearchRuntime()` returns LegacySearchRuntime
- [ ] Confirm đèn hậu TTFB returns to legacy profile (~3–5 s, ~100 KB payload)

See [SEARCH-PRODUCTION-CUTOVER-01.md](./SEARCH-PRODUCTION-CUTOVER-01.md) for exact rollback commands.
