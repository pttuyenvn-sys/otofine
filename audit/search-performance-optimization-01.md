# SEARCH-PERFORMANCE-OPTIMIZATION-01

**Date:** 2026-06-22  
**Objective:** Faster perceived search via abort, cache, progressive render, dedup — without changing ranking/scope/SEO.

**Build:** `npm run build` — PASS

---

## Before / After

| Aspect | Before | After |
|--------|--------|-------|
| Debounce | 200ms | **300ms** (configurable) |
| Sidebar + batch | `Promise.all` — wait for both | **Sidebar first**, batch patches products |
| Cache | None | **120s** in-memory, stale-while-revalidate |
| In-flight dedup | None | **Reuse promise** per cache key |
| Loading UX | Blocking until both APIs return | **Categories immediate**, product **skeletons** |
| Abort | Single controller, parallel fetch | **Abort every prior run**; request-id guard |
| Min length | `< 2` skip | Same + **OEM part number** immediate search |

### Timing (typical dev, `bugi toyota`)

| Phase | Before (sequential wait) | After |
|-------|--------------------------|-------|
| First paint (groups) | ~batch latency (~400ms+) | **~sidebar (~120ms)** |
| Products visible | With groups | **+preview (~180ms)** after skeleton |
| Repeat query | Full network | **Instant** from cache + background refresh |

---

## Architecture

```
keystroke → debounce 300ms
    ↓
shouldFetch? (len≥2 or OEM)
    ↓
cache hit? → render immediately → background SWR fetch
    ↓ miss
AbortController + requestId++
    ↓
dedupeSearchSuggestInflight(cacheKey)
    ↓
fetch sidebar → render provisional groups + skeletons
    ↓
fetch preview-batch → patch products (deduped server-side)
    ↓
writeSearchSuggestCache
```

**Dev-only timing** (`NODE_ENV=development`):

```
Search
query
bugi toyota
Sidebar
118 ms
Preview
192 ms
Total
238 ms
```

---

## Request lifecycle

| Scenario | Requests completed |
|----------|-------------------|
| Fast typing `b→bu→bug→bugi` | **≤2** sidebar + **≤2** batch (prior aborted) |
| Repeat `bugi toyota` | **0** UI wait (cache); **1+1** background refresh |
| Identical in-flight | **1** shared promise (dedup) |

---

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/search/searchSuggestPerformance.js` | **NEW** — debounce/TTL constants |
| `frontend/lib/search/searchSuggestCache.js` | **NEW** — cache + inflight dedup |
| `frontend/lib/search/searchSuggestFetch.js` | **NEW** — progressive fetch + dev timing |
| `frontend/lib/search/parseSearchIntent.js` | `shouldFetchSearchSuggest`, `isOemPartNumberQuery` |
| `frontend/components/pages/Home.jsx` | Cache, abort, progressive state |
| `frontend/components/pages/home/HomeSearch.jsx` | Skeleton rows, pending state |
| `frontend/components/pages/Home.css` | Skeleton shimmer styles |
| `frontend/scripts/validate-search-performance-optimization-01.mjs` | **NEW** |

**Unchanged:** ranking, scope, parser logic, SEO, URLs, backend APIs.

---

## Validation

```bash
npm run build
pm2 restart otofine-frontend
node scripts/validate-search-performance-optimization-01.mjs
# + all existing search validation scripts
```

Screenshots:
- `audit/search-performance-optimization-01/after-performance-desktop.png`
- `audit/search-performance-optimization-01/after-performance-mobile.png`

---

## Deploy

```bash
pm2 restart otofine-frontend
```
