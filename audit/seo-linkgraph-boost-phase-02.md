# SEO-LINKGRAPH-BOOST-PHASE-02

**Scope:** Internal `<a href>` only — no new URLs, no sitemap/governance/canonical/redirect changes.

---

## Changes

### Marketplace (`buildListingYearRangeLinks.server.js`)

| Page | Phase-01 | Phase-02 |
|------|----------|----------|
| CBM | ≤12 year ranges | **≤24** |
| BMY | ≤12 year ranges | **≤24** |
| BMY_RANGE | siblings only | siblings + **parent BMY** (`Tất cả đời xe — {brand} {model}`) |
| CBMY_RANGE | siblings only | siblings + **parent CBM** |

### Shop (`projectShopSeoCrawlLinks.shared.js`)

| Limit | Phase-01 | Phase-02 |
|-------|----------|----------|
| `full.years` | 8 | **16** |
| `collection.years` | 4 | **8** |
| `contextual` | 8 | **16** |

### Shop crawl graph improvements

- **Year bucket:** 50/50 split vehicle vs category year-range links; skip single-year links when `vehicleYearRanges` exist.
- **Category contextual:** `SHOP_CATEGORY` → brand landings (enables category → CBMV → year-range chain).
- **CBMV contextual:** year-range links prioritized over single-year when ranges exist.

---

## Coverage (`phutungoto355` + marketplace inventory)

| Metric | Phase-01 | Phase-02 | Target | Status |
|--------|----------|----------|--------|--------|
| `SHOP_*_YEAR_RANGE` | 22.8% (21/92) | **73.9%** (68/92) | 40%+ | **PASS** |
| `CBMY_RANGE` (full sitemap) | 17.8% | 17.8% (651/3665) | 30%+ | Governance ceiling* |
| `CBMY_RANGE` (gated ≥2 products) | ~17.8% | **100%** (651/651) | — | **PASS** |

\*Only **651 / 3665** `CBMY_RANGE` rows pass the existing product-count gate. Without governance changes, full-inventory coverage cannot exceed **17.8%**. Phase-02 raises per-page caps and adds parent/sibling links so **all gated** ranges are HTML-reachable.

---

## Validation

```bash
cd frontend
npm run build                                    # exit 0
node scripts/validate-shop-seo-linkgraph-01.mjs  # PASS
node scripts/validate-linkgraph-boost-phase-02.mjs # PASS
node scripts/measure-linkgraph-boost-phase-02.mjs
```

### Live HTML checks

- `/ma-phanh-toyota-vios` — up to 24 `CBMY_RANGE` links
- `/phu-tung-toyota-vios` — up to 24 `BMY_RANGE` links
- `/phu-tung-toyota-vios-2014-2020` — parent `/phu-tung-toyota-vios` + siblings
- `/ma-phanh-toyota-vios-2014-2020` — parent `/ma-phanh-toyota-vios`
- `/shops/phutungoto355` — 16 year-range links in **Đời xe** section

---

## Build

```
npm run build  →  exit 0
pm2 restart otofine-frontend
```

---

## Files touched

- `frontend/lib/seo/buildListingYearRangeLinks.server.js`
- `frontend/lib/shopseo/projectShopSeoCrawlLinks.shared.js`
- `frontend/lib/shopseo/projectShopSeoCrawlLinks.js`
- `frontend/lib/shopseo/projectShopSeoContextualCrawlLinks.js`
- `frontend/components/shopsite/ShopSeoCrawlLinks.jsx`
- `frontend/scripts/validate-shop-seo-linkgraph-01.mjs`
- `frontend/scripts/validate-linkgraph-boost-phase-02.mjs` (new)
- `frontend/scripts/measure-linkgraph-boost-phase-02.mjs` (new)
