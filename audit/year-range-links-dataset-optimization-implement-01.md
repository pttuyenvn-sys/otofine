# YEAR-RANGE-LINKS-DATASET-OPTIMIZATION-IMPLEMENT-01

**Date:** 2026-06-22  
**Scope:** Replace `resolveListingYearRangeLinks` data source — no URL, canonical, sitemap, or governance rule changes.

---

## Summary

Added `GET /api/seo/year-range-links` returning slim BMY_RANGE + CBMY_RANGE inventory only. `buildListingYearRangeLinks.server.js` now fetches this endpoint instead of full `sitemap-data` (~8.9 MB).

**Build:** `npm run build` — **PASS**  
**Parity:** `node scripts/validate-year-range-links-dataset-optimization-implement-01.mjs` — **ALL PASS**

---

## Files changed

| File | Change |
|------|--------|
| `backend/services/seoYearRangeLinks.service.js` | **NEW** — loads range listings, slim fields, Redis/memory cache 1 h |
| `backend/controllers/seo.controller.js` | `getYearRangeLinks` handler + `Cache-Control` |
| `backend/routes/seo.routes.js` | `GET /year-range-links` route |
| `frontend/lib/seo/buildListingYearRangeLinks.server.js` | `fetchYearRangeLinksInventory()` → `/seo/year-range-links` |
| `frontend/scripts/validate-year-range-links-dataset-optimization-implement-01.mjs` | **NEW** — parity + metrics validation |

---

## Endpoint contract

```
GET /api/seo/year-range-links
Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400
```

```json
{
  "bmyRangeListings": [
    { "slug", "brand", "model", "yearFrom", "yearTo", "productCount" }
  ],
  "cbmyRangeListings": [
    { "slug", "categorySlug", "brand", "model", "yearFrom", "yearTo", "productCount" }
  ]
}
```

- **No** products, locations, `governanceInventory`, or other sitemap sections.
- CBMY rows with `productCount < 2` omitted from wire (never pass existing `gateCategoryBrandVehicleYearRangeEntry`; link output unchanged).
- Backend cache key `seo:year-range-links:v1`, TTL **3600 s** (matches frontend `revalidate: 3600`).

---

## Before / after payload

| Source | Bytes | vs full |
|--------|------:|--------:|
| `GET /api/seo/sitemap-data` | **8,911,374** | — |
| `GET /api/seo/year-range-links` | **116,768** | **−98.7%** |

**Target:** &lt;150 KB — **PASS** (114 KB)  
**Parse target:** &lt;5 ms — **PASS** (0.7 ms)

Row counts: **106** BMY + **651** CBMY (link-eligible).

---

## Before / after latency (localhost)

| Stage | sitemap-data | year-range-links |
|-------|-------------:|-----------------:|
| Fetch | 2,798 ms | **314 ms** |
| JSON parse | 156 ms | **0.7 ms** |
| **Total** | **~2,954 ms** | **~315 ms** |

**Estimated saving per slug render:** ~**2.6 s** fetch+parse (warm cache improves further).

---

## Heap (parse)

| Payload | Heap delta (approx.) |
|---------|---------------------:|
| sitemap-data (~8.9 MB) | ~8,600 KB |
| year-range-links (~117 KB) | **~123 KB** |

---

## Parity result

Validation compares slim inventory + resolved link sections for:

| Case | Links |
|------|------:|
| BMY Toyota Vios | 12 |
| BMY_RANGE Toyota Vios 2014-2020 | 12 |
| CBMY ma-phanh Toyota Vios | 1 |
| CBMY_RANGE ma-phanh Toyota Vios 2014-2020 | 1 |

**Before (sitemap-data) vs after (year-range-links): identical** for all cases.

Parent links still computed locally (`buildVehicleOwnerPath` / `buildCategoryOwnerPathFromState`) — unchanged.

---

## Validation

```bash
pm2 restart otofine-backend
node frontend/scripts/validate-year-range-links-dataset-optimization-implement-01.mjs
cd frontend && npm run build
pm2 restart otofine-frontend
```

---

## Deploy

```bash
pm2 restart otofine-backend otofine-frontend
```
