# Runtime errors — SEARCH-PRODUCTION-STABILIZATION-01

**Source:** PM2 logs `otofine-backend`  
**Window:** Last 500–2000 lines + full error log scan  
**Post-cutover uptime at audit:** ~8 minutes

---

## Search-specific errors

**None found.**

Patterns searched:
- `[SEARCH]`
- `searchSuggest`
- `inverted`
- `search_token_index`
- `product_search_index`
- `SearchIndexSync`

No matches in recent stdout/stderr related to search failures after cutover.

---

## Unhandled promise rejections

**None found.**

Searched for:
- `Unhandled`
- `unhandledRejection`
- `process.processTicksAndRejections` (in search context)

---

## Non-search errors in error log

| Count | Error | Impact on search |
|-------|-------|------------------|
| 1 (historical) | `getSitemapData: Error: connect ECONNREFUSED 127.0.0.1:3306` | **None** — sitemap/SEO path, not suggest |

Total lines in `otofine-backend-error.log`: 252  
Unique error types in log: **1** (DB connection refused for sitemap, predates or unrelated to search cutover)

---

## HTTP layer (live benchmark)

| Metric | Value |
|--------|-------|
| Total suggest requests | 45 |
| HTTP 200 | 45 |
| HTTP 5xx | 0 |
| Timeouts | 0 |

---

## Controller error path

`search.controller.getSearchSuggest` catches errors and returns `500 { error: "Failed" }`. No `[SEARCH] suggest:` log lines observed in PM2 output during audit window.

---

## Conclusion

**Search V2 runtime is error-free in the post-cutover observation window.**  
Continue monitoring PM2 logs for `[SEARCH]` entries over 24–72 h as traffic grows.
