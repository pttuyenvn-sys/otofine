# Root Cause — SEARCH-END-TO-END-LATENCY-AUDIT-01

## Summary

Real users wait **4–5 seconds** because production serves **`LegacySearchRuntime`** over **`GET /api/search/suggest`**, where backend wall time routinely reaches **2–5 s** on broad queries (LIKE-fallback, large grouping scans). The **~77 ms benchmark** measures **in-process inverted-runtime stages only** on warm localhost — it excludes HTTP, debounce, legacy SQL, and React.

**User-perceived latency ≈ 300 ms debounce + ~120 ms TLS/connect + backend TTFB + ~5–15 ms React.**

For **đèn hậu Kia** (production curl 2026-06-22): **300 + 120 + 4537 + 15 ≈ 4972 ms**.

---

## Why ~77 ms ≠ user experience

| Layer | ~77 ms benchmark | Real user path |
|-------|------------------|----------------|
| Scope | `benchInvertedStages()` in validation script | Browser → otofine.com → legacy service |
| Runtime | Inverted (not production default) | **Legacy** (`SEARCH_RUNTIME` unset) |
| Network | None (in-process `performance.now`) | HTTPS + 101 KB JSON on slow queries |
| Debounce | None | **300 ms** fixed |
| Popup stage | Often **~0 ms** (skipped/cached hydration) | Legacy `buildPreviewBlocksFromInventory` up to **1290 ms** |
| SQL | In-memory inverted index reads | **products** table FULLTEXT/LIKE CTEs (**823–842 ms** per statement, repeated) |

Source: `audit/search-inverted-index-runtime-01/latency-breakdown.json` vs `audit/search-inverted-runtime-canary-01/latency-report.json`.

---

## Dominant latency buckets (slow query waterfall)

```
Keypress (T0)
  │ ~1 ms   React setState (searchInputValue, panel open)
  ▼
Debounce ─────────────────────────────── 300 ms  ◄── fixed frontend tax
  │
  ▼
HTTP connect/TLS ──────────────────────── ~120 ms
  │
  ▼
Legacy backend (đèn hậu Kia) ──────────── ~4537 ms TTFB  ◄── 91% of E2E
  ├─ ranking / provider chain ─────────── ~1586 ms (canary)
  ├─ grouping (863 category groups) ───── ~2651 ms (canary)
  └─ popup hydration ──────────────────── ~666–1290 ms (canary)
  │
  ▼
JSON download + parse ─────────────────── ~15 ms (101 KB)
  │
  ▼
React setState + render ───────────────── ~5–15 ms
  │
  ▼
Popup visible
```

---

## Production runtime verification

From `backend/.env` and config defaults:

- **`SEARCH_RUNTIME`**: unset → **`legacy`**
- **`SEARCH_CANARY`**: unset → off (no shadow double-run in prod)
- **`SEARCH_ENGINE_MODE`**: unset → `hybrid`
- Inverted-only flags (`SEARCH_RANKING_MODE=weighted_v2`, `SEARCH_GROUPING_MODE=quality_gate_v2`) **not active** without `SEARCH_RUNTIME=inverted`

Live production timing confirms legacy behavior: đèn hậu Kia **4537 ms TTFB** matches canary legacy **p95 4902 ms**, not inverted benchmark **143 ms**.

---

## Frontend factors (secondary)

1. **300 ms debounce** — intentional; adds fixed delay before any request (`Home.jsx` line 116, `searchSuggestPerformance.js`).
2. **Monolithic endpoint** — SEARCH-SINGLE-ENDPOINT-01; no progressive sidebar-first render; popup waits for full JSON.
3. **Cold-cache UX gap** — on cache miss with no prior groups, dropdown opens but **`hasQuickSuggest` is false** until response; **no top-level loading skeleton** (skeleton only inside existing groups). User sees a **blank panel** for the entire backend wait.
4. **AbortController + requestId** — correctly prevents race bugs; does **not** reduce wait for the final query.
5. **In-memory cache (120 s)** — helps repeat queries only; first query pays full cost.
6. **No SWR** — custom cache; no stale-while-revalidate streaming.
7. **React / Profiler** — not measured; estimated **<15 ms** post-JSON; not root cause.

Product list fetch (`GET /products`) runs on **committed URL keyword**, not on every suggest keystroke — it does not explain popup delay during typing.

---

## HTTP request accounting

| Scenario | Suggest requests | Notes |
|----------|------------------|-------|
| Fast typing to final query | **1** | Intermediate debounce timers cancelled |
| Slow typing (pause ≥300 ms per prefix) | **1 per prefix** ≥2 chars | Earlier requests aborted |
| Identical concurrent fetch | **1** | `dedupeSearchSuggestInflight` |
| Search commit (Enter) | **+1** `/products` | Separate from popup |

---

## Query-class correlation

| Query | Prod TTFB | Legacy canary | Inverted benchmark |
|-------|-----------|---------------|-------------------|
| bugi Toyota | 528 ms | ~170 ms | 89 ms |
| má phanh Vios | 402 ms | ~190 ms | 85 ms |
| lọc dầu Mazda | 2085 ms | ~1700 ms | 38 ms |
| bố thắng | 4000 ms | ~2300 ms | 28 ms |
| đèn hậu Kia | **4537 ms** | **p95 4902 ms** | 144 ms |

Slow queries correlate with **like-fallback provider**, **large group counts** (863 categories for đèn hậu legacy), and **repeated heavy SQL** on `products` (see runtime-trace audit).

---

## Root cause statement

**Primary:** Production **`LegacySearchRuntime`** executes expensive **products-table grouping and ranking SQL** before returning monolithic suggest JSON. Backend TTFB is **400 ms – 5.2 s** depending on query class — not the **~77 ms** inverted in-process benchmark.

**Secondary:** Fixed **300 ms debounce** and **cold-cache empty panel** add perceived wait before and during backend time.

**Not root cause:** React render, AbortController races, duplicate final-request fetching, or network connect alone.

---

## Audit constraints

Read-only. No code, SQL, config, or feature-flag changes were made. Timings synthesized from existing audits, source review, and production curl samples.
