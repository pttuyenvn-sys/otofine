import { getSiteUrl } from "@/lib/seo/siteUrl";
import { buildProductImageAlt } from "@/lib/seo/buildProductImageAlt";
import { gateProductEntry } from "@/lib/seo/sitemapGovernance.server";
import { loadMarketplaceSitemapData } from "./loadMarketplaceSitemapData.server.js";
import { resolveProductSitemapPath } from "./resolveProductSitemapPath.server.js";
import {
  isPublicProductImageUrl,
  resolveAbsoluteProductImageUrl,
} from "./resolveProductSitemapImage.server.js";

/**
 * @typedef {import('next').MetadataRoute.Sitemap[number] & {
 *   images?: Array<{ loc: string, title?: string }>
 * }} ProductSitemapRow
 */

/**
 * @returns {Promise<import('next').MetadataRoute.Sitemap>}
 */
export async function projectProductsSitemap() {
  const base = getSiteUrl();
  const now = new Date();
  const seen = new Set();
  /** @type {ProductSitemapRow[]} */
  const out = [];

  /**
   * @param {string} url
   * @param {Partial<ProductSitemapRow>} [opts]
   */
  function add(url, opts = {}) {
    if (seen.has(url)) return;
    seen.add(url);
    out.push({
      url,
      lastModified: opts.lastModified || now,
      changeFrequency: opts.changeFrequency || "weekly",
      priority: opts.priority ?? 0.6,
      ...(Array.isArray(opts.images) && opts.images.length
        ? { images: opts.images }
        : {}),
    });
  }

  const { remote } = await loadMarketplaceSitemapData();

  for (const p of remote.products || []) {
    if (!gateProductEntry({ productCount: 1 })) continue;

    const m = String(p?.slug || "").match(/(\d+)$/);
    const id =
      p?.id != null && p.id !== ""
        ? Number(p.id)
        : m
          ? Number(m[1])
          : null;
    if (!Number.isFinite(id) || id <= 0) continue;

    const path = resolveProductSitemapPath(p, id);
    if (!path || path === "/") continue;

    const rawImage =
      p.primaryImageUrl || p.primaryImage || p.imageUrl || p.image || null;
    const imageLoc = resolveAbsoluteProductImageUrl(rawImage);
    /** @type {Array<{ loc: string, title?: string }>} */
    const images = [];
    if (imageLoc && isPublicProductImageUrl(imageLoc)) {
      const title = buildProductImageAlt({
        id: p.id,
        partName: p.partName,
        partNumber: p.partNumber,
        cars: p.cars,
      });
      images.push({
        loc: imageLoc,
        ...(title ? { title } : {}),
      });
    }

    add(`${base}${path}`, {
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      priority: 0.75,
      ...(images.length ? { images } : {}),
    });
  }

  return out;
}
