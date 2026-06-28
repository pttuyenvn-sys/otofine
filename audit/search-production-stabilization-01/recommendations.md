# Recommendations — SEARCH-PRODUCTION-STABILIZATION-01

**Audit:** Post-cutover stabilization (read-only)  
**Verdict:** Search V2 is **stable** in initial observation window.

---

## Immediate (monitoring)

1. **Watch PM2 logs for 72 h** — grep `[SEARCH]`, `inverted`, `unhandledRejection`. No errors in first 8 min; extend observation.
2. **Track P95 suggest latency** — baseline: **337 ms** (this audit). Alert if P95 >800 ms sustained.
3. **Alert on queries >1000 ms** — none observed; zero is expected with inverted runtime on current corpus.

---

## Short-term (operational)

4. **Confirm `SEARCH_INVERTED_INDEX=1` stays on** — token sync on product updates; coverage currently 100% (7,385/7,385).
5. **PSI row count (8,602 rows / 7,385 products)** — ~1.16 rows/product is expected (multi-fitment documents). `extra_psi_not_active_product=0` — no stale sellable mismatch detected.
6. **Optional shadow canary** — `SEARCH_CANARY=1` with sample rate 10% for ongoing parity metrics without user impact (not required; health is good).

---

## Quality (known pre-cutover gaps)

7. **Top10 parity 98.57%** — below 99% SLA from canary gates; monitor user reports on ranking edge cases (`bugi Toyota`, `má phanh vios`).
8. **No-result queries** — `brake pad`, unknown part numbers return fast empty JSON; catalog gap not runtime bug.
9. **Re-run grouping parity spot-check** monthly if inventory mix changes significantly.

---

## Not recommended now

- **Rollback to legacy** — latency regression would be severe (đèn hậu 3.8 s → 0.3 s).
- **Search logic changes** — out of scope; system healthy as configured.
- **Full reindex** — not needed; token and PSI coverage complete.

---

## Rollback (unchanged from cutover)

If instability appears:

```env
SEARCH_RUNTIME=legacy
```

```bash
pm2 restart otofine-backend
```

See [search-production-cutover-01/SEARCH-PRODUCTION-CUTOVER-01.md](../search-production-cutover-01/SEARCH-PRODUCTION-CUTOVER-01.md).

---

## Next audit triggers

- P95 suggest latency >800 ms for 1 h
- Any `[SEARCH] suggest:` 500 errors in logs
- Token coverage drops below 99%
- PM2 unstable restarts >0 after cutover
