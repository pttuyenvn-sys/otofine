# IMAGE-SITEMAP-IMPLEMENT-01

**Date:** 2026-06-22  
**Scope:** Image metadata inside existing `sitemap-products.xml` only — no separate image sitemap  
**Unchanged:** canonical, robots, URL governance, marketplace-core, marketplace-location, shops sitemaps

---

## Summary

Product sitemap entries now include Google Image extension metadata (`image:image` / `image:loc` / `image:title`) for marketplace PDP URLs with a primary gallery image. Partition autoscaling (`sitemap-products-N.xml`) works unchanged — image blocks ride on each `<url>` entry.

---

## Files changed

| File | Change |
|------|--------|
| `backend/controllers/seo.controller.js` | Batch-load `primaryImageUrl` per product via `selectPrimaryImagesForProducts` |
| `frontend/lib/seo/sitemap/xml.server.js` | Render `xmlns:image` + `image:image` blocks when entries carry `images[]` |
| `frontend/lib/seo/sitemap/projectProductsSitemap.server.js` | Attach primary image + ALT title per product URL |
| `frontend/lib/seo/sitemap/resolveProductSitemapImage.server.js` | **NEW** — absolute HTTPS image URL normalization |
| `frontend/tests/unit/sitemapImageXml.test.mjs` | **NEW** — XML namespace + block rendering |
| `frontend/scripts/validate-image-sitemap-implement-01.mjs` | **NEW** — parity, probes, size audit |

---

## Sample XML

### Before

```xml
<url>
  <loc>https://otofine.com/ang-ten-duoi-ca-kia-sedona-2014-2020-96210a9000swp-108</loc>
  <lastmod>2026-06-25T10:30:04.151Z</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.8</priority>
</url>
```

### After

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://otofine.com/ang-ten-duoi-ca-kia-sedona-2014-2020-96210a9000swp-108</loc>
    <lastmod>2026-06-25T10:30:04.151Z</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <image:image>
      <image:loc>https://img.otofine.com/shops/2/96210A9000SWP.webp</image:loc>
      <image:title>Ăng ten đuôi cá Kia Sedona 2014-2020 - Mã 96210A9000SWP</image:title>
    </image:image>
  </url>
</urlset>
```

---

## Image selection

| Priority | Source |
|----------|--------|
| 1 | `product_images` row — `ORDER BY isPrimary DESC, id ASC` (same as PDP gallery) |
| Title | `buildProductImageAlt()` from existing part name + fitment + part number |

Products without gallery rows: **no** `image:image` block (URL still listed).

---

## Product count parity

| Metric | Count |
|--------|------:|
| Product URLs (before) | **7,385** |
| Product URLs (after) | **7,385** |
| URL additions | **0** |
| URL removals | **0** |

---

## Image coverage

| Metric | Count |
|--------|------:|
| URLs with `image:image` block | **7,002** |
| Products without image (no block) | **383** |
| Image coverage rate | **94.8%** |
| Duplicate `image:image` per URL | **0** |
| Sample image URL HTTP 200 (n=100) | **100/100** |

---

## Sitemap size delta

| Metric | Value |
|--------|------:|
| `sitemap-products.xml` before (est.) | ~1.40 MB |
| `sitemap-products.xml` after (live) | **2.65 MB** |
| Growth | **~1.25 MB** (+89%) |
| Projected at 50k products | **~17.2 MB** |
| Projected at 100k products | **~34.3 MB** |

Still well under the 45k URL/file partition threshold; size scales linearly with image metadata per product.

---

## Google compatibility

- `xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"` added to product urlset when any entry has images
- `image:loc` — absolute `https://img.otofine.com/...` URLs only
- `image:title` — optional, from existing ALT generator
- Other sitemap groups unchanged (no `xmlns:image`)

---

## Validation

```bash
node frontend/scripts/validate-image-sitemap-implement-01.mjs
# PASS

node frontend/tests/unit/sitemapImageXml.test.mjs
# PASS
```

---

## Build result

```
cd frontend && npm run build
✓ Compiled successfully
Exit code: 0
```

Backend restarted (`pm2 restart otofine-backend`) for `primaryImageUrl` in `/api/seo/sitemap-data`.

---

## Out of scope (unchanged)

- Separate `image-sitemap.xml`
- Category / brand / location / shop / article sitemaps
- Canonical, robots, URL governance
