# SEARCH-MULTI-CATEGORY-PREVIEW-01

**Date:** 2026-06-22  
**Objective:** Search popup shows top 3 ranked categories, each with its own preview products (max 6 total).

**Build:** `npm run build` — see validation below.

---

## Before / After

### Before

```
Gợi ý danh mục (all rows)
Sản phẩm phù hợp nhất
  → 5 products from top category only
Xem tất cả (N) → top category landing
```

### After

```
Bugi Toyota Camry (26)
  product · product
──────────────────
Bugi Toyota Vios (18)
  product · product
──────────────────
Bugi Toyota Altis (4)
  product · product
Xem tất cả phụ tùng Bugi Toyota
```

| Limit | Value |
|-------|-------|
| Categories | **3** max |
| Products per category | **2** max |
| Total preview products | **6** max |

Each preview row comes from **its own** `GET /products?category=…` call — never mixed.

---

## Architecture

```
search-sidebar (1 request)
    ↓ top 3 categories
Promise.all → GET /products?category=cat[i] (≤3 parallel)
    ↓
sortSuggestPreviewProducts per block
    ↓
suggestPreviewBlocks → HomeSearch interleaved UI
```

**View all:** `buildSuggestViewAllLabel()` + `handleSuggestViewAll()` navigates to existing SEO listing with resolved scope + keyword (no URL contract change).

---

## Performance

| Metric | Before | After |
|--------|--------|-------|
| Category fetch | 1 | 1 |
| Product preview fetch | 1 sequential | **≤3 parallel** |
| Max preview API calls per keystroke | 2 | **4** (1 sidebar + 3 previews) |
| Max products transferred (UI) | 5 | **6** (2×3, sorted client-side) |

Reuses existing endpoints only. AbortController cancels stale debounced runs.

---

## Validation

```bash
npm run build
pm2 restart otofine-frontend
node scripts/validate-search-multi-category-preview-01.mjs
```

| Query | Result |
|-------|--------|
| bugi toyota | 3 blocks, 5 products (Bugi \| Bugi Sấy \| Ron Bugi) |
| má phanh vios | 3 blocks, 5 products (Má Phanh \| Má Phanh Trước \| Cuppen Phanh) |
| lọc dầu mazda | 2 blocks, 4 products (Lọc Dầu \| Lọc Dầu Hộp Số) |
| đèn hậu kia | 3 blocks, 6 products (Đèn Hậu Trái \| Đèn Hậu Phải \| Đèn Hậu Bên Trái) |

**Build:** PASS · **Validation:** ALL PASS · **UI:** 3 blocks / 5 products for `má phanh vios`

Screenshot: `audit/search-multi-category-preview-01/after-multi-category-preview-desktop.png`

---

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/search/searchSuggestPreviewConfig.js` | **NEW** — limits 3/2/6 |
| `frontend/lib/search/buildSuggestViewAllLabel.js` | **NEW** — scope CTA label |
| `frontend/components/pages/Home.jsx` | Parallel fetch, `suggestPreviewBlocks`, view-all handler |
| `frontend/components/pages/home/HomeSearch.jsx` | Interleaved category+product blocks |
| `frontend/components/pages/Home.css` | Block styles |
| `frontend/lib/search/highlightSearchQuery.js` | Per-category limit constant |
| `frontend/scripts/validate-search-multi-category-preview-01.mjs` | **NEW** |
| `frontend/scripts/validate-search-query-scope-and-preview-01.mjs` | Updated selectors/limits |
| `frontend/scripts/validate-search-suggest-code-cleanup-01.mjs` | Updated selectors/limits |
| `frontend/scripts/validate-search-ux-refinement-01.mjs` | Updated selectors/view-all label |

**Unchanged:** SEO, URLs, API contracts, category ranking order, product sort rules.

---

## Deploy

```bash
pm2 restart otofine-frontend
```
