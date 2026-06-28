/**
 * ARCH-07.2 — Edge-safe shop subdomain path rewrite classifier.
 * Pure — no DB, no fetch, safe for middleware + shopHost.
 */

import {
  SHOP_COLLECTION_SLUG,
  SHOP_STATIC_ROUTES,
  SHOP_VEHICLE_PREFIX,
} from "./namespace.js";

const TENANT_STATIC = new Set([
  SHOP_STATIC_ROUTES.HOME,
  SHOP_STATIC_ROUTES.ABOUT,
  SHOP_STATIC_ROUTES.CONTACT,
  SHOP_STATIC_ROUTES.LEGACY_COLLECTION,
  SHOP_STATIC_ROUTES.COLLECTION,
]);

/** Product detail slugs end with `-{numericId}` (not a 4-digit model year). */
const PRODUCT_YEAR_SUFFIX_RE = /-(19|20)\d{2}$/;
const PRODUCT_ID_SUFFIX_RE = /-\d+$/;

function isProductDetailSlug(segment) {
  // Vehicle/tree SEO URLs may contain numeric model tokens (e.g. cx-5,
  // 1-series) and must not be treated as product detail pages.
  if (segment.startsWith(`${SHOP_VEHICLE_PREFIX}-`)) return false;
  if (!PRODUCT_ID_SUFFIX_RE.test(segment)) return false;
  if (PRODUCT_YEAR_SUFFIX_RE.test(segment)) return false;
  return true;
}

/**
 * @param {string} subPath
 * @returns {string}
 */
export function normalizeSubPath(subPath) {
  const raw = String(subPath || "").trim();
  if (!raw || raw === "/") return "/";
  const clean = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? `/${clean}` : "/";
}

/**
 * True when a subdomain pathname should rewrite into the shop tenant router.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isShopSeoRewritePath(pathname) {
  const clean = normalizeSubPath(pathname);
  if (TENANT_STATIC.has(clean)) return true;

  const segment = clean.replace(/^\//, "").toLowerCase();
  if (!segment || segment.includes("/")) return false;

  if (isProductDetailSlug(segment)) return false;

  if (segment === SHOP_COLLECTION_SLUG) return true;

  if (segment.startsWith(`${SHOP_VEHICLE_PREFIX}-`) && segment !== SHOP_COLLECTION_SLUG) {
    return true;
  }

  if (segment.endsWith("-o-to")) return true;

  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(segment)) return true;

  return false;
}

/**
 * @param {string} pathname
 * @returns {string | null} internal path suffix after `/shops/{slug}`
 */
export function resolveShopSeoInternalSuffix(pathname) {
  const clean = normalizeSubPath(pathname);
  if (clean === SHOP_STATIC_ROUTES.HOME) return "";
  if (clean === SHOP_STATIC_ROUTES.ABOUT) return "/gioi-thieu";
  if (clean === SHOP_STATIC_ROUTES.CONTACT) return "/lien-he";
  if (
    clean === SHOP_STATIC_ROUTES.LEGACY_COLLECTION ||
    clean === SHOP_STATIC_ROUTES.COLLECTION
  ) {
    return `/seo/${SHOP_COLLECTION_SLUG}`;
  }
  const segment = clean.replace(/^\//, "");
  return `/seo/${segment}`;
}
