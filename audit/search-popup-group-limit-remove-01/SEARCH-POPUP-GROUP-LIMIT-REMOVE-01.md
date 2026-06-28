# SEARCH-POPUP-GROUP-LIMIT-REMOVE-01

**Date:** 2026-06-27  
**Scope:** Backend only — remove preview group truncation in suggest popup assembly.

---

## Problem

Frontend (`HomeSearch.jsx`) already renders all `response.groups`, but the backend capped preview blocks at **3 groups** (max 6) via `.slice(0, groupLimit)` in preview builders.

---

## Change

Removed group truncation in all three preview block builders. **Ranking order unchanged** — still uses the full `rankedVehicleGroups` array in rank order.

| File | Function |
|------|----------|
| `backend/services/search/runtime/invertedInventoryQuery.js` | `buildInvertedPreviewBlocks` |
| `backend/services/search/searchSuggestPreviewProducts.service.js` | `buildPreviewBlocksFromInventory` |
| `backend/services/search/runtime/indexInventoryQuery.js` | `buildIndexPreviewBlocks` |

**Removed:**
- `groupLimit` default `3`
- Hard cap `6`
- `(rankedVehicleGroups || []).slice(0, groupLimit)`

**Unchanged:**
- `productsPerGroup` default **2** (max 4 via query param)
- Ranking, grouping, candidate retrieval, runtime selection
- API route, JSON shape, frontend
- `assembleSearchSuggestResponse` mapping

---

## Validation

After `pm2 restart otofine-backend`:

### `lọc gió` + Kia

```
GET /api/search/suggest?query=loc+gio&brand=Kia
→ groups: 143  (was 3)
→ products per group: 2 where inventory allows (requirement met)
```

Sample titles: Lọc Gió Kia Carens, Lọc Gió Động Cơ Kia Cerato, … (+141 more)

### `bugi` + Toyota (regression)

```
→ groups: 9  (was 3)
→ products_per_group: [2, 2, 2, 2, 2, 2, 2, 2, 2]
```

---

## Rollback

Restore `.slice(0, groupLimit)` with `groupLimit` default 3 in the three files above.

---

## Not modified

- Search runtime / inverted execution
- Candidate policy, ranking, grouping quality gate
- Parser, SEO, frontend
- `groupLimit` query param still accepted on runtimes but no longer truncates (ignored for slice)
