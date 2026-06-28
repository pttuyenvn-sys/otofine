# SEARCH-SUGGEST-CODE-CLEANUP-01

**Date:** 2026-06-22  
**Objective:** Remove dead search suggestion code without changing production popup behavior.

**Build:** `npm run build` — **PASS**

---

## Removed (dead)

| Item | Path / location | Reason |
|------|-----------------|--------|
| `SearchSuggestPanel` component | `frontend/components/pages/home/header/SearchSuggestPanel.jsx` | **Deleted** — never mounted in production |
| `renderSearchPanelOnly()` | `Home.jsx` (~152 lines) | Defined but never called |
| Commented cats-only block | inside `renderSearchPanelOnly` | Orphaned with parent removal |
| Unused imports | `SearchSuggestPanel`, `SearchSuggestThumb` in `Home.jsx` | Only used by dead path |
| Split-layout CSS | `Home.css` | `search-suggest-wrap*`, `search-suggest-split*`, `search-suggest-cat-pill`, `search-suggest-dropdown`, loading/shimmer/empty variants |
| Dead scroll selectors | `HomeSearch.jsx`, `validate-search-mobile-keyboard-ux-01.mjs` | Referenced removed classes |

---

## Kept (production)

| Item | Role |
|------|------|
| `HomeSearch.jsx` | Live search popup (desktop + mobile via `HomeHeader`) |
| `search-suggest-panel` layout | Categories section → products section → view all |
| `renderCategoryPanel()` | Sidebar category tree (separate from search dropdown) |
| Shared product row CSS | `search-suggest-list`, `search-suggest-item`, `search-suggest-cat-row`, etc. |

---

## Production path (unchanged)

```
HomeHeader
  └── HomeSearch (desktop + mobile)
        └── search-suggest-panel
              ├── search-suggest-section--categories
              ├── search-suggest-section--products
              └── search-suggest-view-all
```

Fetch/state in `Home.jsx` — unchanged.

---

## Validation

```bash
cd frontend && npm run build
pm2 restart otofine-frontend
node scripts/validate-search-suggest-code-cleanup-01.mjs
node scripts/validate-search-ux-refinement-01.mjs
node scripts/validate-search-mobile-keyboard-ux-01.mjs
```

| Check | Result |
|-------|--------|
| Dead files / imports absent | **PASS** |
| Desktop popup: categories + products (≤3) | **PASS** |
| Mobile overlay popup | **PASS** |
| UX refinement regression | **PASS** |
| Mobile keyboard UX regression | **PASS** |

---

## Files changed

| File | Change |
|------|--------|
| `frontend/components/pages/home/header/SearchSuggestPanel.jsx` | **Deleted** |
| `frontend/components/pages/Home.jsx` | Remove dead render path + imports |
| `frontend/components/pages/home/HomeSearch.jsx` | Clean scroll listener selectors |
| `frontend/components/pages/Home.css` | Remove unused split/dropdown/pill styles |
| `frontend/scripts/validate-image-dimension-implement-01.mjs` | Drop deleted surface |
| `frontend/scripts/validate-search-mobile-keyboard-ux-01.mjs` | Update scroll selector |
| `frontend/scripts/validate-search-suggest-code-cleanup-01.mjs` | **NEW** |

**Unchanged:** SEO, URLs, APIs, ranking, search fetch logic, `HomeSearch` JSX structure.

---

## Deploy

```bash
pm2 restart otofine-frontend
```
