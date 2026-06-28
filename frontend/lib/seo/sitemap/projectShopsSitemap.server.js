import { fetchPublicShopDirectorySafe } from "@/services/shopPublic.service";
import { loadShopSeoSitemapEntries } from "@/lib/shopseo/loadShopSeoSitemap.js";
import { SHOP_SITEMAP_KIND } from "@/lib/shopseo/namespace.js";

/** SEO landing kinds aggregated into apex sitemap-shops.xml (no static storefront pages). */
const AGGREGATED_SHOP_SEO_KINDS = new Set([
  SHOP_SITEMAP_KIND.SHOP_CATEGORY,
  SHOP_SITEMAP_KIND.SHOP_BRAND,
  SHOP_SITEMAP_KIND.SHOP_VEHICLE,
  SHOP_SITEMAP_KIND.SHOP_CATEGORY_BRAND,
  SHOP_SITEMAP_KIND.SHOP_CATEGORY_VEHICLE,
  SHOP_SITEMAP_KIND.SHOP_VEHICLE_YEAR_RANGE,
  SHOP_SITEMAP_KIND.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
]);

/**
 * Aggregate public shop SEO URLs across all shops into one apex group.
 *
 * @returns {Promise<import('next').MetadataRoute.Sitemap>}
 */
export async function projectShopsSitemap() {
  const seen = new Set();
  /** @type {import('next').MetadataRoute.Sitemap} */
  const out = [];

  const directory = await fetchPublicShopDirectorySafe({ perPage: 1000, page: 1 });
  const shops = Array.isArray(directory?.items) ? directory.items : [];

  for (const shop of shops) {
    const slug = String(shop?.slug || shop?.shopSlug || "").trim();
    if (!slug) continue;

    let entries;
    try {
      entries = await loadShopSeoSitemapEntries(slug);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!AGGREGATED_SHOP_SEO_KINDS.has(entry.kind)) continue;
      if (!entry.url || seen.has(entry.url)) continue;
      seen.add(entry.url);
      out.push({
        url: entry.url,
        lastModified: entry.lastModified || new Date(),
        changeFrequency: entry.changeFrequency || "weekly",
        priority: entry.priority ?? 0.5,
      });
    }
  }

  return out;
}
