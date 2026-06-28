import { getSiteUrl } from "@/lib/seo/siteUrl";
import {
  MAX_URLS_PER_FILE,
  SITEMAP_CACHE_MARKETPLACE,
  SITEMAP_CACHE_SHOPS,
  SITEMAP_GROUPS,
} from "./constants.server.js";
import { paginateSitemapEntries } from "./paginateSitemapEntries.server.js";
import { projectMarketplaceCoreSitemap } from "./projectMarketplaceCoreSitemap.server.js";
import { projectMarketplaceLocationSitemap } from "./projectMarketplaceLocationSitemap.server.js";
import { projectProductsSitemap } from "./projectProductsSitemap.server.js";
import { projectShopsSitemap } from "./projectShopsSitemap.server.js";
import {
  buildSitemapIndex,
  renderSitemapUrlset,
  sitemapXmlResponse,
} from "./xml.server.js";

/** @typedef {import('./constants.server.js').SitemapGroupKey} SitemapGroupKey */

/** @type {Record<SitemapGroupKey, () => Promise<import('next').MetadataRoute.Sitemap>>} */
const GROUP_LOADERS = {
  products: projectProductsSitemap,
  "marketplace-core": projectMarketplaceCoreSitemap,
  "marketplace-location": projectMarketplaceLocationSitemap,
  shops: projectShopsSitemap,
};

/**
 * @param {SitemapGroupKey} groupKey
 */
export function createGroupSitemapHandler(groupKey) {
  const group = SITEMAP_GROUPS[groupKey];
  const cacheMaxAge =
    groupKey === "shops" ? SITEMAP_CACHE_SHOPS : SITEMAP_CACHE_MARKETPLACE;

  async function loadEntries() {
    return GROUP_LOADERS[groupKey]();
  }

  /** Root group file — urlset or partition index. */
  async function GET() {
    const entries = await loadEntries();
    const base = getSiteUrl();

    if (entries.length <= MAX_URLS_PER_FILE) {
      return sitemapXmlResponse(renderSitemapUrlset(entries), cacheMaxAge);
    }

    const pages = paginateSitemapEntries(entries);
    const locs = pages.map(
      (_, index) => `${base}/${group.partPrefix}-${index + 1}.xml`,
    );
    return sitemapXmlResponse(buildSitemapIndex(locs), cacheMaxAge);
  }

  return { GET };
}

/**
 * @param {SitemapGroupKey} groupKey
 */
export function createGroupSitemapPartHandler(groupKey) {
  const group = SITEMAP_GROUPS[groupKey];
  const cacheMaxAge =
    groupKey === "shops" ? SITEMAP_CACHE_SHOPS : SITEMAP_CACHE_MARKETPLACE;

  /**
   * @param {Request} _request
   * @param {{ params: Promise<{ part: string }> }} context
   */
  async function GET(_request, context) {
    const { part } = await context.params;
    const partNumber = Number.parseInt(String(part || ""), 10);
    if (!Number.isFinite(partNumber) || partNumber < 1) {
      return new Response("Not Found", { status: 404 });
    }

    const entries = await GROUP_LOADERS[groupKey]();
    if (entries.length <= MAX_URLS_PER_FILE) {
      return new Response("Not Found", { status: 404 });
    }

    const pages = paginateSitemapEntries(entries);
    const slice = pages[partNumber - 1];
    if (!slice) {
      return new Response("Not Found", { status: 404 });
    }

    return sitemapXmlResponse(renderSitemapUrlset(slice), cacheMaxAge);
  }

  return { GET, group };
}

export async function renderRootSitemapIndex() {
  const base = getSiteUrl();
  const locs = Object.values(SITEMAP_GROUPS).map((group) => `${base}/${group.filename}`);
  return sitemapXmlResponse(buildSitemapIndex(locs), SITEMAP_CACHE_MARKETPLACE);
}

/**
 * Load all marketplace groups for parity validation.
 */
export async function loadAllMarketplaceSitemapEntries() {
  const [products, core, location] = await Promise.all([
    projectProductsSitemap(),
    projectMarketplaceCoreSitemap(),
    projectMarketplaceLocationSitemap(),
  ]);
  return { products, core, location };
}
