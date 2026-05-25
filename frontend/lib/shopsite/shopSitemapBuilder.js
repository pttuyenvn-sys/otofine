import { getSiteUrl } from "@/lib/seo/siteUrl";

/**
 * Storefront sitemap builder — PREPARED but NOT exposed.
 *
 * This module is intentionally NOT imported from `app/sitemap.js`
 * during Phase 5.5. The existing apex `/sitemap.xml` keeps its
 * current contents untouched so we don't disturb the live SEO
 * surface.
 *
 * When wildcard DNS + indexing flip on (Phase 5.6+), `app/sitemap.js`
 * will:
 *   1. fetch the list of `seoEligible` shops from the public API
 *   2. call `buildShopSitemapEntries(shop)` for each
 *   3. merge the results into the global sitemap
 *
 * Until then the function is pure / testable / dormant.
 *
 * @param {{ slug:string, productCount?:number }} shop
 * @param {{ categories?: Array<{slug:string}> }} [opts]
 * @returns {import('next').MetadataRoute.Sitemap}
 */
export function buildShopSitemapEntries(shop, opts = {}) {
  if (!shop || !shop.slug) return [];
  const base = getSiteUrl();
  const root = `${base}/shops/${encodeURIComponent(shop.slug)}`;
  const now = new Date();

  // Default page set per storefront — matches the four real route
  // segments under `app/(shopsite)/shops/[slug]/`.
  const pages = [
    { url: root,                  priority: 0.7, changeFrequency: "weekly" },
    { url: `${root}/gioi-thieu`,  priority: 0.5, changeFrequency: "monthly" },
    { url: `${root}/san-pham`,    priority: 0.6, changeFrequency: "weekly" },
    { url: `${root}/lien-he`,     priority: 0.4, changeFrequency: "monthly" },
  ];

  // Categories — each becomes `/san-pham?category=<slug>`. We DO NOT
  // emit product pages here: those live on apex `/<slug>-<id>`
  // (root-level canonical) and are already covered by the global
  // sitemap (canonical safety per Phase 5.5 spec — legacy /product/
  // <id> AND /phu-tung/<slug>-<id> apex URLs 308-redirect to the
  // root canonical so cross-host link equity is preserved end-to-end).
  if (Array.isArray(opts.categories)) {
    for (const c of opts.categories) {
      if (!c?.slug) continue;
      pages.push({
        url: `${root}/san-pham?category=${encodeURIComponent(c.slug)}`,
        priority: 0.4,
        changeFrequency: "weekly",
      });
    }
  }

  return pages.map((p) => ({ ...p, lastModified: now }));
}

/**
 * Convenience iterator used by the future global sitemap builder.
 *
 * @param {Array} shops  shops with `slug` + `seoEligible`
 */
export function buildShopsiteSitemap(shops) {
  if (!Array.isArray(shops)) return [];
  const out = [];
  for (const s of shops) {
    if (!s?.seoEligible) continue;
    out.push(...buildShopSitemapEntries(s));
  }
  return out;
}
