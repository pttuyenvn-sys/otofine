/**
 * ARCH-07.1 — Shop-only sitemap projection (NOT wired to marketplace sitemap).
 */

import { buildShopStorefrontUrl } from "../shopsite/buildShopStorefrontUrl.js";
import { getShopIndexTier } from "../shopsite/shopIndexGovernance.js";
import {
  buildShopCategorySeoPath,
  buildShopVehicleSeoPath,
} from "./buildShopSeoPath.js";
import { SHOP_NAMESPACE, SHOP_SITEMAP_KIND, SHOP_STATIC_ROUTES } from "./namespace.js";
import { isShopSeoSitemapEligible } from "./shopSeoGovernance.js";

/**
 * @typedef {object} ShopSitemapEntry
 * @property {string} kind
 * @property {string} url
 * @property {string} path
 * @property {number} [productCount]
 * @property {number} [priority]
 * @property {'weekly' | 'monthly'} [changeFrequency]
 */

/**
 * Project sitemap entries for ONE shop subdomain storefront.
 * Only emits HOME, ABOUT, CONTACT, COLLECTION, SHOP_CATEGORY,
 * SHOP_VEHICLE, SHOP_VEHICLE_YEAR_RANGE — never product/location/CBMY URLs.
 *
 * @param {object} input
 * @param {string} input.shopSlug
 * @param {{ tier?: string } | Record<string, unknown>} [input.shop]
 * @param {Array<{ slug?: string, name?: string, productCount?: number, brand?: string, model?: string, year?: string | number, namespace?: string }>} [input.landingPages]
 * @returns {ShopSitemapEntry[]}
 */
export function projectShopSitemap(input) {
  const slug = String(input.shopSlug || "").trim();
  if (!slug) return [];

  const shopTier = getShopIndexTier(input.shop || {});
  if (shopTier.tier === "BLOCK") return [];

  const now = new Date();
  const entries = [];

  const staticPages = [
    { kind: SHOP_SITEMAP_KIND.HOME, path: SHOP_STATIC_ROUTES.HOME, priority: 0.8, changeFrequency: "weekly" },
    { kind: SHOP_SITEMAP_KIND.ABOUT, path: SHOP_STATIC_ROUTES.ABOUT, priority: 0.5, changeFrequency: "monthly" },
    { kind: SHOP_SITEMAP_KIND.CONTACT, path: SHOP_STATIC_ROUTES.CONTACT, priority: 0.4, changeFrequency: "monthly" },
    { kind: SHOP_SITEMAP_KIND.COLLECTION, path: SHOP_STATIC_ROUTES.COLLECTION, priority: 0.7, changeFrequency: "weekly" },
  ];

  for (const page of staticPages) {
    entries.push(toEntry(slug, page, now));
  }

  const landings = Array.isArray(input.landingPages) ? input.landingPages : [];
  for (const row of landings) {
    const namespace = row.namespace || inferNamespace(row);
    const productCount = Number(row.productCount) || 0;
    if (!isShopSeoSitemapEligible(namespace, { productCount })) continue;

    const path =
      row.path ||
      (row.categoryName || row.categorySlug
        ? buildShopCategorySeoPath(row)
        : buildShopVehicleSeoPath(row));

    if (!path || path === "/") continue;

    const kind = namespaceToSitemapKind(namespace);
    if (!kind) continue;

    entries.push(
      toEntry(
        slug,
        {
          kind,
          path,
          priority: priorityForKind(kind),
          changeFrequency: "weekly",
          productCount,
        },
        now,
      ),
    );
  }

  return entries;
}

/**
 * @param {string} slug
 * @param {object} page
 * @param {Date} now
 * @returns {ShopSitemapEntry}
 */
function toEntry(slug, page, now) {
  const path = page.path || "/";
  const url = buildShopStorefrontUrl(slug, { subPath: path.replace(/^\//, "") }) || "";
  return {
    kind: page.kind,
    url,
    path,
    productCount: page.productCount,
    priority: page.priority,
    changeFrequency: page.changeFrequency,
    lastModified: now,
  };
}

/**
 * @param {string} namespace
 * @returns {string | null}
 */
function namespaceToSitemapKind(namespace) {
  switch (namespace) {
    case SHOP_NAMESPACE.SHOP_CATEGORY:
      return SHOP_SITEMAP_KIND.SHOP_CATEGORY;
    case SHOP_NAMESPACE.SHOP_CATEGORY_BRAND:
      return SHOP_SITEMAP_KIND.SHOP_CATEGORY_BRAND;
    case SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE:
      return SHOP_SITEMAP_KIND.SHOP_CATEGORY_VEHICLE;
    case SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE_YEAR:
      return SHOP_SITEMAP_KIND.SHOP_CATEGORY_VEHICLE_YEAR;
    case SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE:
      return SHOP_SITEMAP_KIND.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE;
    case SHOP_NAMESPACE.SHOP_BRAND:
      return SHOP_SITEMAP_KIND.SHOP_BRAND;
    case SHOP_NAMESPACE.SHOP_VEHICLE:
      return SHOP_SITEMAP_KIND.SHOP_VEHICLE;
    case SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE:
      return SHOP_SITEMAP_KIND.SHOP_VEHICLE_YEAR_RANGE;
    // Backward compatibility: keep parser support for year URLs but
    // do not emit SHOP_VEHICLE_YEAR into sitemap.
    case SHOP_NAMESPACE.SHOP_VEHICLE_YEAR:
      return null;
    default:
      return null;
  }
}

/**
 * @param {object} row
 * @returns {string}
 */
function inferNamespace(row) {
  if (row.namespace) return row.namespace;
  if (row.year) {
    return String(row.year).includes("-")
      ? SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE
      : SHOP_NAMESPACE.SHOP_VEHICLE_YEAR;
  }
  if (row.model) {
    return row.categorySlug || row.categoryName
      ? SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE
      : SHOP_NAMESPACE.SHOP_VEHICLE;
  }
  if (row.brand) {
    return row.categorySlug || row.categoryName
      ? SHOP_NAMESPACE.SHOP_CATEGORY_BRAND
      : SHOP_NAMESPACE.SHOP_BRAND;
  }
  if (row.categorySlug || row.categoryName) return SHOP_NAMESPACE.SHOP_CATEGORY;
  return SHOP_NAMESPACE.SHOP_CATEGORY;
}

/**
 * @param {string} kind
 * @returns {number}
 */
function priorityForKind(kind) {
  switch (kind) {
    case SHOP_SITEMAP_KIND.SHOP_CATEGORY:
      return 0.6;
    case SHOP_SITEMAP_KIND.SHOP_CATEGORY_BRAND:
      return 0.58;
    case SHOP_SITEMAP_KIND.SHOP_CATEGORY_VEHICLE:
      return 0.56;
    case SHOP_SITEMAP_KIND.SHOP_CATEGORY_VEHICLE_YEAR:
      return 0.54;
    case SHOP_SITEMAP_KIND.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE:
      return 0.52;
    case SHOP_SITEMAP_KIND.SHOP_BRAND:
      return 0.57;
    case SHOP_SITEMAP_KIND.SHOP_VEHICLE:
      return 0.55;
    case SHOP_SITEMAP_KIND.SHOP_VEHICLE_YEAR_RANGE:
      return 0.5;
    default:
      return 0.4;
  }
}

/**
 * Convert projection to Next.js MetadataRoute.Sitemap shape.
 *
 * @param {ShopSitemapEntry[]} entries
 * @returns {import('next').MetadataRoute.Sitemap}
 */
export function toNextShopSitemap(entries) {
  return entries.map((e) => ({
    url: e.url,
    lastModified: e.lastModified || new Date(),
    changeFrequency: e.changeFrequency || "weekly",
    priority: e.priority ?? 0.5,
  }));
}
