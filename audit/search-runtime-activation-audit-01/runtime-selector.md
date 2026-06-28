# Runtime selector — SEARCH-RUNTIME-ACTIVATION-AUDIT-01

## Selector function

**File:** `backend/services/search/runtime/searchRuntime.js`

```javascript
export function getSearchRuntime() {
  const mode = getSearchRuntimeMode();
  if (cached && cachedMode === mode) return cached;
  cachedMode = mode;
  if (mode === "index") cached = SearchIndexRuntime;
  else if (mode === "inverted") cached = InvertedSearchRuntime;
  else cached = LegacySearchRuntime;
  return cached;
}
```

**Mode source:** `backend/config/searchRuntimeConfig.js`

```javascript
export function getSearchRuntimeMode() {
  const raw = String(process.env.SEARCH_RUNTIME || "legacy").trim().toLowerCase();
  if (raw === "index") return "index";
  if (raw === "inverted") return "inverted";
  return "legacy";
}
```

## Selection logic

| `SEARCH_RUNTIME` env | `getSearchRuntimeMode()` | Object returned | Class |
|----------------------|--------------------------|-----------------|-------|
| unset / empty / unknown | `legacy` | `LegacySearchRuntime` | products-based |
| `legacy` | `legacy` | `LegacySearchRuntime` | products-based |
| `index` | `index` | `SearchIndexRuntime` | product_search_index → hydrate products |
| `inverted` | `inverted` | `InvertedSearchRuntime` | search_token_index + product_search_index |

Invalid values (e.g. `hybrid`) fall through to **`legacy`**.

## Why Legacy is selected today

1. `backend/.env` contains **no `SEARCH_*` variables**.
2. PM2 process `otofine-backend` injects **no `SEARCH_*` overrides** (verified via `pm2 env 7`).
3. `server.js` loads env with `import "dotenv/config"` before any module reads `process.env`.
4. Therefore `process.env.SEARCH_RUNTIME` is `undefined` → default **`"legacy"`** → **`LegacySearchRuntime`**.

## Canary override (does not change active runtime class)

**File:** `backend/services/searchSuggest.service.js`

When `isSearchCanaryShadowMode()` is true (`SEARCH_CANARY=1` **and** `SEARCH_RUNTIME=legacy`):

- User response is **always** `LegacySearchRuntime.searchSuggest()`.
- Inverted runs **only** in background via `scheduleSearchCanaryComparison()`.

When `SEARCH_RUNTIME=inverted` and `SEARCH_CANARY=1`:

- User response is **`InvertedSearchRuntime`** (via `getSearchRuntime()`).
- Canary comparison still runs in background.

## Cache behavior

`getSearchRuntime()` caches the runtime object per mode. Changing `SEARCH_RUNTIME` at runtime **without process restart** would not switch runtimes until `resetSearchRuntimeCache()` is called (used in validation scripts only). **PM2 restart is required** after env changes.

## Search V2 mapping

In this codebase, **Search V2** = **`SEARCH_RUNTIME=inverted`** plus the inverted sub-flags validated in parity audits:

- `SEARCH_CANDIDATE_POLICY=adaptive`
- `SEARCH_RANKING_MODE=weighted_v2`
- `SEARCH_GROUPING_MODE=quality_gate_v2`

`SEARCH_RUNTIME=index` is a separate **Index runtime** (Phase 02), not Search V2.
