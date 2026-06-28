# SEARCH-RELEVANCE-BOOST-01

**Date:** 2026-06-22  
**Objective:** Boost mobile search / keyword listing relevance — title-start matches rank above mid-title contains.

**Build:** `npm run build` — **PASS**

---

## Problem

Keyword **"giảm"** — suggestions were relevant, but product results did not prioritize title relevance. Products like **"Bạc cao su tay đỡ giảm xóc"** could rank above **"Giảm xóc…"**.

---

## Solution

Shared keyword relevance tiers (lower = better):

| Tier | Signal |
|------|--------|
| 1 | Title **starts with** query |
| 2 | Exact phrase / title equality |
| 3 | Title **contains** query (not at start) |
| 4 | Part number match |
| 5 | Short description / description |
| 9 | Fallback |

Applied to:

- `GET /api/products?keyword=` — listing SQL `ORDER BY`
- `GET /api/products/search` — MySQL `ORDER BY` + post-sort for Typesense results

---

## Validation

```bash
pm2 restart otofine-backend
node backend/scripts/validate-search-relevance-boost-01.mjs
cd frontend && npm run build
```

**Query:** `giảm`

| Endpoint | Top result |
|----------|------------|
| `/products/search?q=giảm` | **Giảm sóc sau** |
| `/products?keyword=giảm` | **Giảm sóc sau** |

Top 3 (both): Giảm sóc sau, Giảm xóc đủ bộ, Giảm xóc sau — all title-start matches.

**Result:** ALL PASS

---

## Files changed

| File | Change |
|------|--------|
| `backend/utils/keywordRelevanceRanking.js` | **NEW** — `scoreKeywordRelevance`, `buildKeywordRelevanceOrderSql` |
| `backend/repositories/productList.repository.js` | Keyword `ORDER BY` uses relevance tiers |
| `backend/services/productSearch.service.js` | MySQL search order + Typesense post-sort |
| `backend/scripts/validate-search-relevance-boost-01.mjs` | **NEW** — unit + API validation |

**Unchanged:** URLs, SEO, frontend components.

---

## Deploy

```bash
pm2 restart otofine-backend
```
