/**
 * SHOP-SEO-LINKGRAPH-01 — Routable crawl hrefs (subdomain + apex basePath).
 * Does not change URL ownership — mirrors existing tenant routing only.
 */

import { SHOP_COLLECTION_PATH, SHOP_STATIC_ROUTES } from "./namespace.js";
import {
  normalizeSubPath,
  resolveShopSeoInternalSuffix,
} from "./isShopSeoRewritePath.js";

/**
 * @param {string} [shopBasePath] "" on subdomain, "/shops/{slug}" on apex
 * @param {string} [seoSubPath] subdomain-relative SEO path e.g. "/loc-gio-o-to"
 * @returns {string}
 */
export function buildShopSeoCrawlHref(shopBasePath = "", seoSubPath = "/") {
  const base = String(shopBasePath || "").replace(/\/+$/, "");
  const subPath = normalizeSubPath(seoSubPath);

  if (!base) {
    return subPath;
  }

  if (
    subPath === SHOP_COLLECTION_PATH ||
    subPath === SHOP_STATIC_ROUTES.COLLECTION
  ) {
    return `${base}${SHOP_COLLECTION_PATH}`;
  }

  const suffix = resolveShopSeoInternalSuffix(subPath);
  if (suffix === "") {
    return base || "/";
  }

  return `${base}${suffix}`;
}
