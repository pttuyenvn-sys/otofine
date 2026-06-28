# IMAGE-MISSING-COVERAGE-DASHBOARD-01

**Date:** 2026-06-22  
**Scope:** Admin-only image coverage monitoring — no storefront or SEO behavior changes  
**Validation:** `cd backend && node scripts/validate-image-missing-coverage-dashboard-01.mjs` — **PASS**

---

## Executive summary

Internal dashboard to monitor **public products missing gallery images**, with seller-level breakdown, filters, detail drill-down, and CSV export.

| Metric | Live count |
|--------|----------:|
| Total public products | **7,385** |
| With images | **7,002** |
| Without images | **383** |
| Coverage rate | **94.8%** |

**Parity check:** `sum(shop.withoutImages) === totals.withoutImages` → **383 = 383** ✓

---

## Files changed

### Backend

| File | Purpose |
|------|---------|
| `backend/modules/admin/seo/services/imageCoverage.service.js` | Aggregation SQL, filters, CSV export, parity validation |
| `backend/modules/admin/seo/controllers/imageCoverage.admin.controller.js` | HTTP handlers |
| `backend/modules/admin/seo/routes/seo.admin.routes.js` | Route registration + RBAC guards |
| `backend/server.js` | Mount `app.use("/api/admin/seo", seoAdminRouter)` |
| `backend/scripts/validate-image-missing-coverage-dashboard-01.mjs` | Automated validation script |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/app/admin/(protected)/seo/image-coverage/page.js` | Dashboard UI |
| `frontend/lib/adminApi.js` | `getImageCoverageReport`, `getShopImageCoverageProducts`, `exportImageCoverageCsv` |
| `frontend/components/admin/AdminSidebar.jsx` | Nav link **SEO · Image Coverage** |

---

## API schema

### `GET /api/admin/seo/image-coverage`

**Auth:** `requireAuth` + `requireAdmin` + `requireAdminSession` + `platform:read`

**Query params (optional):**

| Param | Type | Description |
|-------|------|-------------|
| `status` | `GREEN` \| `YELLOW` \| `RED` | Filter shops by coverage bucket |
| `shopId` | number | Limit to one shop |
| `dateFrom` | `YYYY-MM-DD` | Product created/ordered-from (uses product order column) |
| `dateTo` | `YYYY-MM-DD` | Product created/ordered-to |

**Response:**

```json
{
  "totals": {
    "products": 7385,
    "withImages": 7002,
    "withoutImages": 383,
    "imageCoverageRate": 94.8
  },
  "sellers": [
    {
      "sellerId": 1,
      "shopId": 1,
      "shopName": "AutoPT - Phụ tùng ô tô",
      "productCount": 4529,
      "withImages": 4302,
      "withoutImages": 227,
      "coverageRate": 95,
      "status": "GREEN"
    }
  ],
  "filters": { "shopId": null, "dateFrom": null, "dateTo": null, "status": null },
  "generatedAt": "2026-06-22T..."
}
```

**Sorting (default):** `withoutImages DESC`, then `coverageRate ASC`, then `shopName` (vi).

**Status rules:**

| Status | Coverage |
|--------|----------|
| `GREEN` | ≥ 95% |
| `YELLOW` | 90–95% |
| `RED` | &lt; 90% |

---

### `GET /api/admin/seo/image-coverage/shops/:shopId/products`

**Query params:**

| Param | Description |
|-------|-------------|
| `missingOnly` | `1` or `true` — only products without gallery URL |
| `dateFrom`, `dateTo` | Same as main report |

**Response:**

```json
{
  "shopId": 1,
  "products": [
    {
      "productId": 123,
      "productName": "Bộ lọc gió",
      "partNumber": "ABC-001",
      "createdAt": "2025-01-15T...",
      "sellerId": 1,
      "shopId": 1,
      "shopName": "AutoPT - Phụ tùng ô tô",
      "imageCount": 0,
      "missingMainImage": true,
      "missingThumbnail": false,
      "missingAlt": false
    }
  ]
}
```

**Phase 3 fields** (`missingThumbnail`, `missingMainImage`, `missingAlt`, `imageCount`) are included in API/CSV but not shown in the main table UI yet.

---

### `GET /api/admin/seo/image-coverage/export`

Returns `text/csv` attachment of **missing-image products** (respects `shopId`, `dateFrom`, `dateTo` filters). Max 20,000 rows.

**CSV columns:** `productId`, `productName`, `partNumber`, `createdAt`, `sellerId`, `shopId`, `shopName`, `imageCount`, `missingMainImage`, `missingThumbnail`, `missingAlt`

---

### `GET /api/admin/seo/image-coverage/validate`

Internal QA endpoint — returns parity check + top 20 worst shops.

---

## Dashboard

**Path:** Admin → **SEO · Image Coverage** → `/admin/seo/image-coverage`

**Features:**

- Summary cards: Total Products, With Images, Without Images, Coverage %
- Shop table: Shop, Products, With Images, Without Images, Coverage %, Status (color badges)
- Click shop row → detail panel with missing products (toggle **Only missing images**)
- Filters: Coverage status, Shop ID, date range
- **Export CSV (missing)** button

**Screenshots:** Requires authenticated admin session. After login, open `/admin/seo/image-coverage`. UI uses the same governance-console layout (dark sidebar + white content cards).

---

## Top 20 worst shops (live)

| Rank | Shop | Shop ID | Missing | Products | Coverage |
|-----:|------|--------|--------:|---------:|---------:|
| 1 | AutoPT - Phụ tùng ô tô | 1 | **227** | 4,529 | 95.0% |
| 2 | Phụ tùng ô tô 355 | 2 | **156** | 2,807 | 94.4% |
| 3 | Shop của user 1019 | 25 | 0 | 49 | 100.0% |

Only **3 shops** currently have public products in the visibility gate; **383 missing images** are concentrated in the top two shops (227 + 156 = 383).

---

## Build result

```
cd /var/www/otofine/frontend && npm run build
✓ Compiled successfully
✓ Generating static pages (38/38)
Route: /admin/seo/image-coverage — 4.72 kB
```

**Exit code:** 0

---

## Validation output

```
PASS · sum(shop.withoutImages) === totals.withoutImages
       383 vs 383
PASS · default sort withoutImages DESC, coverageRate ASC
       first=AutoPT - Phụ tùng ô tô (227 missing)
PASS · imageCoverageRate matches withImages/products
       94.8%
RESULT: PASS
```

---

## Out of scope (unchanged)

- Storefront rendering, JSON-LD, sitemap, canonical, robots
- Image upload pipeline or automatic remediation
- UI for Phase 3 quality fields (API-ready only)
