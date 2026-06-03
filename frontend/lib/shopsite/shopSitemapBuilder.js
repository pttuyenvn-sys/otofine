import { buildShopPrimaryCanonicalUrl } from "@/lib/shopHost";

/**
 * Storefront sitemap builder — wired from `app/sitemap.js` (Phase 6B.5).
 *
 * ## Sitemap architecture
 *
 * | Surface | Source | URL host |
 * |---------|--------|----------|
 * | Apex catalog (products, vehicles, categories) | `/api/seo/sitemap-data` | `otofine.com` |
 * | Storefront pages (4 tabs per shop) | same endpoint → `storefronts[]` | `{slug}.otofine.com` |
 *
 * ## Phase 6B.6 index / sitemap alignment
 *
 * Only shops passing `evaluateStorefrontSeoIndexability()` on the backend
 * are emitted in `/api/seo/sitemap-data` → `storefronts[]`. Pages that
 * fail the gate stay `noindex,follow` and are excluded from the sitemap.
 *
 * ## Scalability (100k+ shops)
 *
 * Google caps sitemaps at 50,000 URLs per file. At 4 URLs/shop that
 * is ~12,500 shops before the combined apex+storefront sitemap risks
 * oversize. Mitigation when needed (not implemented yet):
 *   - Next.js `generateSitemaps()` chunking (`/sitemap/[id].xml`)
 *   - or a dedicated storefront sitemap index
 *
 * Data is fetched in one backend query (`listSitemapEligibleStorefronts`)
 * — no N+1 per shop.
 *
 * @param {{ slug:string, shopUpdatedAt?:string|null, latestProductAt?:string|null, lastModified?:string|null }} shop
 * @returns {import('next').MetadataRoute.Sitemap}
 */
export function buildShopSitemapEntries(shop) {
  if (!shop || !shop.slug) return [];

  const root = buildShopPrimaryCanonicalUrl(shop.slug, "");
  if (!root) return [];

  const pageUrl = (subPath) =>
    subPath ? buildShopPrimaryCanonicalUrl(shop.slug, subPath) : root;

  const shopMod = parseLastModified(shop.shopUpdatedAt || shop.lastModified);
  const catalogMod = parseLastModified(
    shop.latestProductAt || shop.lastModified || shop.shopUpdatedAt,
  );
  const fallback = parseLastModified(shop.lastModified) || new Date();

  const pages = [
    {
      url: root,
      lastModified: shopMod || fallback,
      priority: 0.7,
      changeFrequency: "weekly",
    },
    {
      url: pageUrl("gioi-thieu"),
      lastModified: shopMod || fallback,
      priority: 0.5,
      changeFrequency: "monthly",
    },
    {
      url: pageUrl("san-pham"),
      lastModified: catalogMod || fallback,
      priority: 0.6,
      changeFrequency: "weekly",
    },
    {
      url: pageUrl("lien-he"),
      lastModified: shopMod || fallback,
      priority: 0.4,
      changeFrequency: "monthly",
    },
  ];

  return pages.filter((p) => p.url);
}

/**
 * @param {Array} shops rows from `/api/seo/sitemap-data` → `storefronts`
 */
export function buildShopsiteSitemap(shops) {
  if (!Array.isArray(shops)) return [];
  const out = [];
  const seen = new Set();
  for (const s of shops) {
    for (const entry of buildShopSitemapEntries(s)) {
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);
      out.push(entry);
    }
  }
  return out;
}

function parseLastModified(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}
