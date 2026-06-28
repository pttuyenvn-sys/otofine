# SEARCH-RANKING-EXACT-CATEGORY-BOOST-01

**Date:** 2026-06-22  
**Objective:** Boost exact category phrase matches in search-sidebar category suggestions so part intent ranks above vehicle-heavy unrelated categories.

---

## Problem

Query `đèn hậu vios` ranked **Cản Sau**, **Càng A**, etc. above **Đèn Hậu** variants because results were sorted by `total_count DESC` only.

---

## Solution

Post-fetch ranking in `searchSidebarCategories` via `rankCategorySidebarSuggestions()`.

### Priority (lower = better)

| # | Signal |
|---|--------|
| 1 | Exact category phrase (case-insensitive) |
| 2 | Exact normalized phrase (`foldVi` / `normalizeSearchText`) |
| 3 | Prefix match (category starts with phrase or reverse) |
| 4 | Category name contains all phrase tokens |
| 5 | Vehicle tokens in category label (brand/model) |
| 6 | `search_priority` (from catalog) |
| 7 | Shorter canonical name (general before specific) |
| 8 | `total_count` DESC |

**Rule:** Phrase tiers 1–4 always beat vehicle-only boosts (tier 5).

### Phrase extraction

`extractCategoryPhraseFromKeyword()` strips:

- Explicit `brand` / `model` query params
- Common brand/model stop tokens (`vios`, `cx5`, `toyota`, …)
- 4-digit years

---

## Validation results

```bash
pm2 restart otofine-backend
node backend/scripts/validate-search-ranking-exact-category-boost-01.mjs
```

| Query | Top results (after) |
|-------|---------------------|
| đèn hậu vios | Đèn Hậu* variants (not Càng A / Cản Sau) |
| má phanh vios | **Má Phanh** → Má Phanh Trước → … |
| lọc dầu cx5 | **Lọc Dầu** |
| cản sau vios | **Cản Sau** |
| càng a vios | Càng A Phải / Trái |

**API response shape unchanged** — still `{ canonical_name, canonical_slug, total_count }[]`.

---

## Files changed

| File | Change |
|------|--------|
| `backend/utils/categorySuggestRanking.js` | **NEW** — phrase extract + rank |
| `backend/controllers/productCategory.controller.js` | Apply rank after sidebar SQL |
| `backend/scripts/validate-search-ranking-exact-category-boost-01.mjs` | **NEW** |

**Unchanged:** SEO, URLs, frontend contracts, product search ranking.

---

## Deploy

```bash
pm2 restart otofine-backend
```
