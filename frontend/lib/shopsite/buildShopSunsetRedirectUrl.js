/**
 * SHOP-TAXONOMY-SUNSET — absolute apex redirect targets for closed shops.
 * Pure — edge-safe (no fetch).
 */

import { APEX_ORIGIN } from "@/lib/apexOrigin";
import {
  SHOP_COLLECTION_PATH,
  SHOP_STATIC_ROUTES,
} from "@/lib/shopseo/namespace.js";
import {
  isShopSeoRewritePath,
  normalizeSubPath,
} from "@/lib/shopseo/isShopSeoRewritePath.js";
import { looksLikeProductSlug } from "@/lib/seo/productSeoUrl";

function apexUrl(pathname, search) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const qs = String(search || "");
  return new URL(`${APEX_ORIGIN}${path}${qs}`);
}

/**
 * Build an absolute apex redirect URL for a closed shop taxonomy request.
 * Product paths are handled by resolveShopProductSunsetRedirectUrl.
 *
 * @param {Pick<URL, "pathname" | "search">} requestUrl
 * @returns {URL | null}
 */
export function buildShopSunsetRedirectUrl(requestUrl) {
  const pathname = normalizeSubPath(requestUrl.pathname);
  const search = String(requestUrl.search || "");

  const segment = pathname.replace(/^\//, "").toLowerCase();
  if (segment && looksLikeProductSlug(segment)) {
    return null;
  }

  if (pathname.match(/^\/p\/[^/]+\/?$/) || pathname.match(/^\/product\/[^/]+\/?$/)) {
    return null;
  }

  if (pathname === SHOP_STATIC_ROUTES.HOME) {
    return apexUrl("/", search);
  }

  if (
    pathname === SHOP_STATIC_ROUTES.ABOUT ||
    pathname === SHOP_STATIC_ROUTES.CONTACT
  ) {
    return apexUrl("/", search);
  }

  if (pathname === SHOP_STATIC_ROUTES.LEGACY_COLLECTION) {
    return apexUrl(SHOP_COLLECTION_PATH, search);
  }

  if (pathname === SHOP_STATIC_ROUTES.COLLECTION) {
    return apexUrl(SHOP_COLLECTION_PATH, search);
  }

  if (isShopSeoRewritePath(pathname)) {
    return apexUrl(pathname, search);
  }

  return null;
}
