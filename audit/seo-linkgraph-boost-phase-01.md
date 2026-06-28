# SEO-LINKGRAPH-BOOST-PHASE-01

**Scope:** Internal `<a href>` links only — no new URLs, no sitemap changes.

---

## Summary

| Surface | Change |
|---------|--------|
| **Marketplace CBM** | Section **"Các đời xe phù hợp"** → `CBMY_RANGE` links from sitemap inventory |
| **Marketplace BMY** | Section **"Đời xe"** → `BMY_RANGE` links |
| **Marketplace BMY_RANGE** | Section **"Các đời xe khác"** → sibling ranges |
| **Shop home** | `SHOP_CRAWL_LIMITS.full.years`: `0` → **`8`** (collection: **`4`**) |
| **Shop contextual** | `SHOP_CATEGORY_VEHICLE` / `SHOP_VEHICLE` → year-range links; siblings on range pages |

---

## Files

| File | Role |
|------|------|
| `frontend/lib/seo/buildListingYearRangeLinks.server.js` | Marketplace year-range resolver (sitemap inventory + governance) |
| `frontend/components/seo/ListingYearRangeLinks.jsx` | Marketplace link section UI |
| `frontend/app/[slug]/page.js` | Passes `yearRangeLinks` to `Home` |
| `frontend/components/pages/Home.jsx` | Renders section above product grid |
| `frontend/lib/shopseo/projectShopSeoCrawlLinks.shared.js` | `full.years: 8`, `collection.years: 4`; crawl rows carry `filters` |
| `frontend/lib/shopseo/projectShopSeoCrawlLinks.js` | Home/collection year-range emission |
| `frontend/lib/shopseo/projectShopSeoContextualCrawlLinks.js` | Contextual year-range + sibling links (`SHOP_CATEGORY_VEHICLE` fix) |
| `frontend/lib/shopseo/resolveShopSeoCrawlLinksVariant.js` | Year-range namespaces → `contextual` |
| `frontend/components/shopsite/ShopSeoCrawlLinks.jsx` | **"Đời xe"** section |
| `frontend/scripts/validate-linkgraph-boost-phase-01.mjs` | Smoke tests (live HTML + projection) |
| `frontend/scripts/measure-linkgraph-boost-phase-01.mjs` | Coverage estimate |

---

## Bugfix (same phase)

`SHOP_CATEGORY_BRAND_VEHICLE` was referenced but **not defined** in `SHOP_NAMESPACE`. Year-range contextual links for category+vehicle pages (`/ma-phanh-toyota-vios`) are now wired through **`SHOP_CATEGORY_VEHICLE`**.

---

## Validation

```bash
cd frontend
node scripts/validate-shop-seo-linkgraph-01.mjs      # PASS
node scripts/validate-linkgraph-boost-phase-01.mjs   # PASS
node scripts/measure-linkgraph-boost-phase-01.mjs    # coverage estimate
```

### Live HTML (verified)

| URL | Section | Example href |
|-----|---------|--------------|
| `/ma-phanh-toyota-vios` | Các đời xe phù hợp | `/ma-phanh-toyota-vios-2014-2020` |
| `/phu-tung-toyota-vios` | Đời xe | `/phu-tung-toyota-vios-2014-2020` (≤12) |
| `/phu-tung-toyota-vios-2014-2020` | Các đời xe khác | sibling ranges |
| `/shops/phutungoto355` | Đời xe | `/shops/.../seo/phu-tung-kia-sedona-2014-2020` |
| `/shops/phutungoto355/seo/phu-tung-kia-sedona` | Liên kết liên quan | year-range + sibling models |

---

## Coverage estimate (`phutungoto355` + marketplace inventory)

| Metric | Before (audit) | After (projection) |
|--------|----------------|---------------------|
| `SHOP_*_YEAR_RANGE` HTML crawl path | **0%** | **22.8%** (21 / 92 sitemap URLs via home BFS + contextual) |
| `CBMY_RANGE` linked from parent CBM | **~5%** | **17.8%** (651 / 3665; capped ≤12 per parent group, governance ≥2 products) |

**Note:** The 50% targets assume broader crawl depth / more parent pages in the home vehicle cap. Phase 01 delivers the link mechanism and raises coverage from near-zero; further gains are bounded by `SHOP_CRAWL_LIMITS` (8 home / 8 contextual) without new URLs.

---

## Deploy

```bash
cd frontend && npm run build
pm2 restart otofine-frontend
```
