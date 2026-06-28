# SEARCH-INTENT-PARSER-01

**Date:** 2026-06-22  
**Objective:** Parse raw search query into structured listing intent before category suggestions and product preview.

**Build:** `npm run build` — see validation below.

---

## Problem

Search dropdown passed the raw query string and URL vehicle filters separately. Queries like `má phanh vios` did not extract **Toyota / Vios** from the query, so suggestions and preview ignored in-query vehicle context unless the listing URL already had brand/model set.

---

## Solution

New intent parser runs on every debounced suggest fetch:

```
Raw query → parseSearchIntent → mergeSearchIntentWithListingState → API params
```

### Output shape

| Field | Description |
|-------|-------------|
| `category` | Matched from platform category catalog in remaining text |
| `brand` | From brands API, `KNOWN_VEHICLE_BRANDS`, or model alias |
| `model` | From `seoVehicleHot.modelRows` or shorthand aliases (`vios`, `cx5`, `altis`, `vf5`, …) |
| `year` | 4-digit year token |
| `partNumber` | OEM-style token (e.g. `04465-0D140`) |
| `remainingKeywords` | Part keywords after entity extraction |

Parsed intent **fills gaps** in URL listing state; URL values win when parser finds nothing for a slot.

### API keyword

`resolveSearchApiKeyword` sends `partNumber` or `remainingKeywords`; falls back to raw query when both are empty (e.g. fully parsed `má phanh vios`).

### Integration (`Home.jsx`)

- `searchListingState` memo — parse + merge on `searchInputValue`
- `activeSuggestVehicleContext` — vehicle labels + category navigation during search
- Suggest fetch uses `intentBrand`, `intentModel`, `intentYear`, `apiKeyword`

**Unchanged:** SEO URLs, redirects, ranking, API contracts, committed search URL shape.

---

## Validation queries

| Query | brand | model | year | partNumber | notes |
|-------|-------|-------|------|------------|-------|
| má phanh vios | Toyota | Vios | | | category → Má Phanh |
| lọc dầu cx5 | Mazda | CX-5 | | | category → Lọc Dầu |
| lọc gió altis | Toyota | Altis | | | category → Lọc Gió |
| vf5 má phanh | VinFast | VF5 | | | alias (not in vehicle-hot) |
| 04465-0D140 | | | | 04465-0D140 | part number only |
| gương kia morning 2018 | Kia | Morning | 2018 | | remaining → gương |

```bash
cd frontend && npm run build
pm2 restart otofine-frontend
node scripts/validate-search-intent-parser-01.mjs
```

---

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/search/parseSearchIntent.js` | **NEW** — parser, merge, API keyword resolver |
| `frontend/components/pages/Home.jsx` | Wire intent into suggest fetch + vehicle context |
| `frontend/scripts/validate-search-intent-parser-01.mjs` | **NEW** — parser + API + UI validation |

---

## Deploy

```bash
pm2 restart otofine-frontend
```
