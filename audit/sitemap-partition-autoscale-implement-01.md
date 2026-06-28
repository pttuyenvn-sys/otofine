# SITEMAP-PARTITION-AUTOSCALE-IMPLEMENT-01

**Date:** 2026-06-22  
**Status:** Implemented and validated  
**Build:** `npm run build` — PASS  
**Validation:** `node scripts/validate-sitemap-partition-implement-01.mjs` — PASS

---

## Summary

Replaced the monolithic `app/sitemap.js` urlset with a **route-handler sitemap index** and four **grouped, autoscaling** child sitemaps. Marketplace URL governance, eligibility, and emission logic are unchanged — only architecture and file layout changed.

Per-shop subdomain sitemaps (`{slug}.otofine.com/sitemap.xml`) remain unchanged. Apex `sitemap-shops.xml` now aggregates **all public shop SEO landing URLs** system-wide (no per-shop apex files).

---

## Architecture

```mermaid
flowchart TD
  R[GET /sitemap.xml<br/>sitemap index] --> P[sitemap-products.xml]
  R --> C[sitemap-marketplace-core.xml]
  R --> L[sitemap-marketplace-location.xml]
  R --> S[sitemap-shops.xml]

  P --> P1[sitemap-products-N.xml<br/>only if &gt; 45000]
  C --> C1[sitemap-marketplace-core-N.xml]
  L --> L1[sitemap-marketplace-location-N.xml]
  S --> S1[sitemap-shops-N.xml]

  P --> PP[projectProductsSitemap]
  C --> PC[projectMarketplaceCoreSitemap]
  L --> PL[projectMarketplaceLocationSitemap]
  S --> PS[projectShopsSitemap]

  PP --> API[/api/seo/sitemap-data]
  PC --> API
  PL --> API
  PS --> SHOP[loadShopSeoSitemapEntries × all shops]
```

**Autoscale rule:** `MAX_URLS_PER_FILE = 45000`. When a group exceeds 45k URLs, its root file becomes a sitemap index pointing to `…-1.xml`, `…-2.xml`, etc. At current scale all four groups are single urlsets.

---

## Files changed

### Added — shared projection layer

| File | Role |
|------|------|
| `frontend/lib/seo/sitemap/constants.server.js` | `MAX_URLS_PER_FILE`, group metadata |
| `frontend/lib/seo/sitemap/xml.server.js` | `renderSitemapUrlset`, `buildSitemapIndex`, `sitemapXmlResponse` |
| `frontend/lib/seo/sitemap/paginateSitemapEntries.server.js` | Stable sort + 45k pagination |
| `frontend/lib/seo/sitemap/loadMarketplaceSitemapData.server.js` | API + category catalog loader |
| `frontend/lib/seo/sitemap/resolveProductSitemapPath.server.js` | Product path resolver (moved from `sitemap.js`) |
| `frontend/lib/seo/sitemap/projectProductsSitemap.server.js` | PRODUCTS group |
| `frontend/lib/seo/sitemap/projectMarketplaceCoreSitemap.server.js` | MARKETPLACE_CORE group |
| `frontend/lib/seo/sitemap/projectMarketplaceLocationSitemap.server.js` | MARKETPLACE_LOCATION group |
| `frontend/lib/seo/sitemap/projectShopsSitemap.server.js` | SHOPS aggregate |
| `frontend/lib/seo/sitemap/createGroupSitemapHandler.server.js` | Route handler factory + root index |

### Added — route handlers

| File |
|------|
| `frontend/app/sitemap.xml/route.js` |
| `frontend/app/sitemap-products.xml/route.js` |
| `frontend/app/sitemap-products-[part].xml/route.js` |
| `frontend/app/sitemap-marketplace-core.xml/route.js` |
| `frontend/app/sitemap-marketplace-core-[part].xml/route.js` |
| `frontend/app/sitemap-marketplace-location.xml/route.js` |
| `frontend/app/sitemap-marketplace-location-[part].xml/route.js` |
| `frontend/app/sitemap-shops.xml/route.js` |
| `frontend/app/sitemap-shops-[part].xml/route.js` |

### Added — validation

| File |
|------|
| `frontend/scripts/validate-sitemap-partition-implement-01.mjs` |

### Modified

| File | Change |
|------|--------|
| `frontend/lib/shopseo/loadShopSeoSitemap.js` | Export `loadShopSeoSitemapEntries` for shop aggregation |
| `frontend/app/(shopsite)/shops/[slug]/sitemap.xml/route.js` | Use shared XML renderer |

### Removed

| File |
|------|
| `frontend/app/sitemap.js` |

### Unchanged (per requirements)

- `frontend/lib/seo/sitemapGovernance.server.js`
- `frontend/lib/seo/urlGovernance` thresholds
- `frontend/app/robots.js`
- `frontend/middleware.js` (shop subdomain `/sitemap.xml` rewrite preserved)
- Backend `getSitemapData` and all `*SitemapQuality.server.js` providers

---

## Counts

### Pre-migration (monolithic apex)

| Group | Count |
|-------|------:|
| Products | ~7,402 |
| Marketplace Core | ~2,873 |
| Marketplace Location | ~1,734 |
| Shops (subdomain only, not in apex) | ~481 |
| **Apex total** | **12,010** |

### Post-migration (live probe)

| Group | Count | File type |
|-------|------:|-----------|
| **Products** | **7,385** | urlset |
| **Marketplace Core** | **2,922** | urlset |
| **Marketplace Location** | **1,703** | urlset |
| **Shops** | **469** | urlset |
| **Marketplace union** | **12,010** | — |

Shops count (469) is SEO landing URLs only (SHOP_CATEGORY, SHOP_BRAND, SHOP_VEHICLE, SHOP_CATEGORY_BRAND, SHOP_CATEGORY_VEHICLE, SHOP_VEHICLE_YEAR_RANGE, SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE). Static storefront pages (HOME, ABOUT, CONTACT, COLLECTION) are excluded from apex `sitemap-shops.xml` but remain in per-subdomain shop sitemaps.

---

## Parity report

| Check | Result |
|-------|--------|
| `UNION(products, core, location)` size | **12,010** |
| Expected apex total | **12,010** |
| Missing URLs | **0** |
| Duplicate URLs (marketplace union) | **0** |
| Duplicate URLs (shops group) | **0** |
| Root `sitemap.xml` is sitemap index | **YES** |
| Four child sitemaps in root index | **YES** |

---

## Sample URL verification

| Group | Sample URL | HTTP | Canonical | Robots |
|-------|------------|------|-----------|--------|
| Products | `https://otofine.com/ang-ten-duoi-ca-kia-sedona-2014-2020-96210a9000swp-108` | 200 | self | `index, follow` |
| Marketplace Core | `https://otofine.com/phu-tung-kia-sedona` | 200 | self | `index, follow` |
| Marketplace Location | `https://otofine.com/phu-tung-o-to-tai-ha-noi` | 200 | self | `index, follow` |
| Shops | `https://phutungoto355.otofine.com/can-truoc-o-to` | 200 | self | `index, follow` |

---

## Build result

```
npm run build — PASS (Next.js 15.5.15)
```

All sitemap routes registered as dynamic (`ƒ`):

- `/sitemap.xml`
- `/sitemap-products.xml` (+ `[part]` variant)
- `/sitemap-marketplace-core.xml` (+ `[part]`)
- `/sitemap-marketplace-location.xml` (+ `[part]`)
- `/sitemap-shops.xml` (+ `[part]`)

Deployed via `pm2 restart otofine-frontend`.

---

## GSC follow-up

Resubmit `https://otofine.com/sitemap.xml` in Google Search Console. Apex changed from single urlset → sitemap index; URL set for marketplace pages is identical.
