/**
 * SHOP-PRODUCT-SUNSET — closed-shop product 301s to apex PDP (with fallbacks).
 * Extends taxonomy sunset; edge-safe fetch via resolveMiddlewareApiBase.
 */

import { APEX_ORIGIN } from "@/lib/apexOrigin";
import { SHOP_COLLECTION_PATH } from "@/lib/shopseo/namespace.js";
import { normalizeSubPath } from "@/lib/shopseo/isShopSeoRewritePath.js";
import {
  extractProductIdFromSeoSlug,
  looksLikeProductSlug,
} from "@/lib/seo/productSeoUrl";
import { buildProductCategoryLinks } from "@/lib/seo/buildProductCategoryLinks";
import { resolveMiddlewareApiBase } from "@/lib/shopsite/middlewareApiBase";
import { buildShopSunsetRedirectUrl } from "@/lib/shopsite/buildShopSunsetRedirectUrl";

const PROBE_CACHE = new Map();
const PROBE_TTL_MS = 60_000;

function apexUrl(pathname, search) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const qs = String(search || "");
  return new URL(`${APEX_ORIGIN}${path}${qs}`);
}

/**
 * Classify a shop-subdomain path as a marketplace product detail URL.
 * Reuses the same helpers as apex resolveSeoEntity / product routes.
 *
 * @param {string} pathname
 * @returns {{ productId: number, segment: string | null, shortPath: boolean } | null}
 */
export function parseShopProductDetailPath(pathname) {
  const clean = normalizeSubPath(pathname);
  const segment = clean.replace(/^\//, "").toLowerCase();

  const shortMatch = clean.match(/^\/p\/([^/]+)\/?$/);
  if (shortMatch) {
    const productId = extractProductIdFromSeoSlug(shortMatch[1]);
    if (productId) {
      return { productId, segment: null, shortPath: true };
    }
  }

  const legacyMatch = clean.match(/^\/product\/([^/]+)\/?$/);
  if (legacyMatch) {
    const productId = extractProductIdFromSeoSlug(legacyMatch[1]);
    if (productId) {
      return { productId, segment: null, shortPath: true };
    }
  }

  if (segment && looksLikeProductSlug(segment)) {
    const productId = extractProductIdFromSeoSlug(segment);
    if (productId) {
      return { productId, segment, shortPath: false };
    }
  }

  return null;
}

/**
 * @param {number} productId
 * @returns {Promise<object | null>}
 */
async function probeApexProductDetail(productId) {
  const key = String(productId);
  const hit = PROBE_CACHE.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = `${resolveMiddlewareApiBase()}/product/${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      PROBE_CACHE.set(key, { value: null, expires: Date.now() + PROBE_TTL_MS });
      return null;
    }
    const value = await res.json();
    PROBE_CACHE.set(key, { value, expires: Date.now() + PROBE_TTL_MS });
    return value;
  } catch {
    return null;
  }
}

/**
 * @param {string} slug
 * @returns {Promise<string | null>}
 */
async function lookupCategoryLandingPath(slug) {
  const candidate = String(slug || "").trim().toLowerCase();
  if (!candidate) return null;

  const url = `${resolveMiddlewareApiBase()}/product-categories/slug/${encodeURIComponent(candidate)}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    const canonical = String(
      body?.canonical_slug || body?.category_slug || candidate,
    )
      .trim()
      .toLowerCase();
    return canonical ? `/${canonical}` : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} segment
 * @param {number} productId
 * @returns {Promise<string | null>}
 */
async function resolveCategoryFallbackPath(segment, productId) {
  const prefix = segment.replace(new RegExp(`-${productId}$`), "");
  const tokens = prefix.split("-").filter(Boolean);
  /** @type {string[]} */
  const candidates = [];

  for (let i = 1; i <= Math.min(tokens.length, 5); i++) {
    const part = tokens.slice(0, i).join("-");
    candidates.push(part);
    candidates.push(`${part}-o-to`);
  }

  for (const slug of [...new Set(candidates)]) {
    const path = await lookupCategoryLandingPath(slug);
    if (path) return path;
  }

  return null;
}

/**
 * @param {object | null} detail
 * @returns {string | null}
 */
function categoryPathFromProductDetail(detail) {
  const links = buildProductCategoryLinks(detail?.categories);
  const first = links[0];
  return first?.href && first.href !== "/" ? first.href : null;
}

/**
 * Resolve product sunset redirect for a closed shop request.
 *
 * @param {Pick<URL, "pathname" | "search">} requestUrl
 * @returns {Promise<URL | null>}
 */
export async function resolveShopProductSunsetRedirectUrl(requestUrl) {
  const pathname = normalizeSubPath(requestUrl.pathname);
  const search = String(requestUrl.search || "");

  const parsed = parseShopProductDetailPath(pathname);
  if (!parsed) return null;

  const detail = await probeApexProductDetail(parsed.productId);

  if (detail?.product) {
    if (parsed.shortPath) {
      const canonical =
        detail.canonicalPath ||
        detail.productIdentity?.canonicalPath ||
        null;
      if (canonical && canonical !== pathname) {
        return apexUrl(canonical, search);
      }
    }
    return apexUrl(pathname, search);
  }

  const fromCategories = categoryPathFromProductDetail(detail);
  if (fromCategories) {
    return apexUrl(fromCategories, search);
  }

  if (parsed.segment) {
    const categoryPath = await resolveCategoryFallbackPath(
      parsed.segment,
      parsed.productId,
    );
    if (categoryPath) {
      return apexUrl(categoryPath, search);
    }
  }

  return apexUrl(SHOP_COLLECTION_PATH, search);
}

/**
 * Taxonomy (sync) then product (async) sunset redirect resolver.
 *
 * @param {Pick<URL, "pathname" | "search">} requestUrl
 * @returns {Promise<URL | null>}
 */
export async function resolveShopSunsetRedirectUrl(requestUrl) {
  const taxonomyTarget = buildShopSunsetRedirectUrl(requestUrl);
  if (taxonomyTarget) return taxonomyTarget;

  return resolveShopProductSunsetRedirectUrl(requestUrl);
}
