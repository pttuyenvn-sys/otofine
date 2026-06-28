# SEARCH-UX-REFINEMENT-01

**Date:** 2026-06-22  
**Objective:** Refine search popup UX — highlights, section structure, preview limit, empty states, lighter typography, mobile tap targets.

**Build:** `npm run build` — **PASS**

---

## Before / after

### Before

- Large blue **“DANH MỤC PHỤ TÙNG”** header in dropdown
- Category + product lists without clear section hierarchy
- No query highlighting in suggestions
- Up to 12 product rows in preview
- No “view all” affordance
- Product preview could mismatch category intent (addressed in prior task; kept)

### After

```
Gợi ý danh mục
  Giảm xóc trước phải Toyota Vios (3)   ← matched tokens highlighted

Sản phẩm phù hợp nhất
  [thumb] Giảm xóc trước phải Toyota Vios …  (max 3)

Xem tất cả (23)   ← when total > 3; navigates to top suggestion SEO landing
```

- Section title **“Gợi ý danh mục”** — small, muted (no blue banner)
- **Case-insensitive** token highlight via `<mark class="search-suggest-highlight">`
- **3** preview products max; total from existing `total_count` / `found`
- Empty: hide category block if none; product empty → **“Không tìm thấy sản phẩm phù hợp.”**
- Mobile rows **44–48px** tap height

---

## Implementation

| # | Change |
|---|--------|
| 1 | `highlightSearchQuery.js` + `SearchQueryHighlight.jsx` |
| 2 | Preview capped at `SEARCH_SUGGEST_PREVIEW_LIMIT = 3`; `suggestPreviewTotal` in `Home.jsx` |
| 3 | `search-suggest-panel` section order in `HomeSearch.jsx` |
| 4 | Conditional sections + empty message |
| 5 | Replaced sidebar category box in search dropdown with section titles |
| 6 | Mobile spacing in `Home.css` overlay block |

**Unchanged:** SEO, URLs, ranking, API contracts.

---

## Validation

```bash
cd frontend && npm run build
pm2 restart otofine-frontend
node scripts/validate-search-ux-refinement-01.mjs
node scripts/validate-search-suggest-product-intent-alignment-01.mjs
```

| Keyword | Categories | Products (≤3) | Highlights |
|---------|------------|---------------|------------|
| giảm xóc vios | ✓ | 3 | ✓ |
| lọc dầu | ✓ | 2 | ✓ |
| má phanh | ✓ | 3 | ✓ |
| càng a | ✓ | 3 | ✓ |

Mobile tap height: **46px** — PASS

---

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/search/highlightSearchQuery.js` | **NEW** — token highlight parts |
| `frontend/components/search/SearchQueryHighlight.jsx` | **NEW** — safe `<mark>` render |
| `frontend/components/pages/home/HomeSearch.jsx` | Sectioned popup, limits, view all |
| `frontend/components/pages/Home.jsx` | `suggestPreviewTotal`, `suggestLoading` |
| `frontend/components/pages/Home.css` | Section styles, highlight, mobile tap |
| `frontend/scripts/validate-search-ux-refinement-01.mjs` | **NEW** |
| `frontend/scripts/validate-search-suggest-product-intent-alignment-01.mjs` | Selector updates |
| `frontend/scripts/validate-search-vehicle-context-suggest-01.mjs` | Selector updates |
| `frontend/scripts/validate-search-mobile-keyboard-ux-01.mjs` | Selector updates |

---

## Deploy

```bash
pm2 restart otofine-frontend
```
