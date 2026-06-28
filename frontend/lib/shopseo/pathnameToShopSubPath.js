/**
 * SHOP-OWNERSHIP-01 — Normalize browser pathname → shop SEO subPath for parseShopSeoPath.
 * Pure — safe for client + tests.
 */

import { SHOP_COLLECTION_PATH, SHOP_STATIC_ROUTES } from "./namespace.js";

/**
 * @param {string} pathname
 * @param {string} [shopBasePath] e.g. "" on subdomain or "/shops/my-shop"
 * @returns {string} subPath for parseShopSeoPath (leading slash)
 */
export function pathnameToShopSubPath(pathname, shopBasePath = "") {
  let path = String(pathname || "").split("?")[0].trim();
  if (!path) return "/";

  const base = String(shopBasePath || "").replace(/\/+$/, "");
  if (base && (path === base || path.startsWith(`${base}/`))) {
    path = path.slice(base.length) || "/";
  }

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  if (path.startsWith("/seo/")) {
    path = path.slice("/seo".length) || "/";
  } else if (path === "/seo") {
    path = "/";
  }

  if (
    path === SHOP_STATIC_ROUTES.LEGACY_COLLECTION ||
    path === `${SHOP_STATIC_ROUTES.LEGACY_COLLECTION}/`
  ) {
    path = SHOP_COLLECTION_PATH;
  }

  if (path !== "/" && path.endsWith("/")) {
    path = path.replace(/\/+$/, "") || "/";
  }

  return path || "/";
}
