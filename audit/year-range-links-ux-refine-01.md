# YEAR-RANGE-LINKS-UX-REFINE-01

**Date:** 2026-06-22  
**Objective:** Improve year-range link UX (title, position, chip styling) without changing URLs, link inventory, or crawl graph.

**Build:** `npm run build` — **PASS**

---

## Summary

Year-range cross-links keep the same **12 hrefs** on Toyota Vios listing variants. Presentation only:

- Title: **"Đời xe"** → **"Các đời Toyota Vios khác"** (dynamic per brand/model)
- Position: below product grid + SEO article (no longer above products)
- Visual: pill/chip links with active-state styling when `href` matches current path

---

## Before / after UX

| Aspect | Before | After |
|--------|--------|-------|
| **Title** | `Đời xe` | `Các đời Toyota Vios khác` |
| **Position** | Above product grid (top of content column) | Below `SeoContent`, above “Về Otofine” |
| **Visual** | Plain text links in grey box | Rounded chips (`listing-year-range-links__chip`) |
| **Context** | Felt like raw SEO block | Clearly “other generations for this model” |

### Screenshot (after)

`/phu-tung-toyota-vios-2015` — full page:

`audit/screenshots/year-range-links-ux-refine-01/after-toyota-vios-2015.png`

*(No before screenshot was captured in-repo; prior state used title `Đời xe` and placement above `#otofine-products-start`.)*

---

## Link parity

Validation: `node frontend/scripts/validate-year-range-links-ux-refine-01.mjs`

| Path | Link count | Title |
|------|----------:|-------|
| `/phu-tung-toyota-vios` | **12** | Các đời Toyota Vios khác |
| `/phu-tung-toyota-vios-2015` | **12** | Các đời Toyota Vios khác |
| `/phu-tung-toyota-vios-2014-2020` | **12** | Các đời Toyota Vios khác |
| `/ma-phanh-toyota-vios` | **1** | Các đời Má Phanh Toyota Vios phù hợp |

**Parity:** identical `href` sets on `/phu-tung-toyota-vios` and `/phu-tung-toyota-vios-2015` — **PASS**

---

## SEO impact

| Signal | Changed? |
|--------|------------|
| hrefs / URLs | **No** |
| Link count / inventory | **No** |
| Crawl graph | **No** |
| Canonical / robots / sitemap | **No** |
| HTML crawlability (`<nav>` + `<a href>`) | **Yes** — same semantic structure |

---

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/seo/buildListingYearRangeLinks.server.js` | Dynamic titles (`buildVehicleSiblingTitle`, `buildCategorySiblingTitle`) |
| `frontend/components/seo/ListingYearRangeLinks.jsx` | Chip UI, `usePathname` active state |
| `frontend/components/seo/seo-landing.css` | Chip/tag styles |
| `frontend/components/pages/Home.jsx` | Moved section below `SeoContent` |
| `frontend/scripts/validate-year-range-links-ux-refine-01.mjs` | **NEW** — parity + placement checks |
| `frontend/scripts/validate-linkgraph-boost-phase-01.mjs` | Title assertion update |
| `frontend/scripts/validate-linkgraph-boost-phase-02.mjs` | Title assertion update |

---

## Validation

```bash
cd frontend && npm run build
pm2 restart otofine-frontend
node frontend/scripts/validate-year-range-links-ux-refine-01.mjs
```

**Result:** ALL PASS

---

## Deploy

```bash
pm2 restart otofine-frontend
```
