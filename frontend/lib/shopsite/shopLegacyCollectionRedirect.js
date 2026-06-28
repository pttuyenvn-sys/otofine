/**
 * SHOP-SEO-LEGACY-02 — 301 targets for legacy `/san-pham` collection alias.
 * Pure helpers — safe for middleware (edge) and server components.
 */

import {
  SHOP_COLLECTION_PATH,
  SHOP_STATIC_ROUTES,
} from "../shopseo/namespace.js";
import { buildShopStorefrontUrl } from "./buildShopStorefrontUrl.js";

const LEGACY_PATH = SHOP_STATIC_ROUTES.LEGACY_COLLECTION;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/**
 * @param {string} pathname
 * @returns {string}
 */
export function normalizePathForLegacyCheck(pathname) {
  return String(pathname || "").replace(/\/+$/, "") || "/";
}

/**
 * Subdomain pathname is exactly `/san-pham` (not deep SEO paths).
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isShopLegacyCollectionSubdomainPath(pathname) {
  return normalizePathForLegacyCheck(pathname) === LEGACY_PATH;
}

/**
 * Apex tenant path `/shops/{slug}/san-pham` — returns slug or null.
 *
 * @param {string} pathname
 * @returns {string | null}
 */
export function parseShopLegacyCollectionApexPath(pathname) {
  const match = String(pathname || "").match(
    /^\/shops\/([^/]+)\/san-pham\/?$/i,
  );
  if (!match) return null;
  const slug = String(match[1] || "").trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

/**
 * @param {Pick<URL, "hostname" | "port" | "protocol">} requestUrl
 * @returns {Pick<Location, "hostname" | "port" | "protocol">}
 */
export function locationFromRequestUrl(requestUrl) {
  return {
    hostname: requestUrl.hostname,
    port: requestUrl.port,
    protocol: requestUrl.protocol,
  };
}

/**
 * Canonical collection URL on the shop subdomain.
 *
 * @param {string} slug
 * @param {{ location?: Pick<Location, "hostname" | "port" | "protocol"> | null, search?: string }} [options]
 * @returns {string | null}
 */
export function buildShopLegacyCollectionRedirectTarget(slug, options = {}) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!SLUG_RE.test(normalized)) return null;

  const subPath = SHOP_COLLECTION_PATH.replace(/^\//, "");
  const base =
    buildShopStorefrontUrl(normalized, {
      subPath,
      location: options.location ?? null,
    }) || null;
  if (!base) return null;

  const search = String(options.search || "").replace(/^\?/, "");
  if (!search) return base;

  const url = new URL(base);
  url.search = search;
  return url.toString();
}

/**
 * Subdomain same-host redirect URL (`/san-pham` → `/phu-tung-o-to`).
 *
 * @param {URL} requestUrl
 * @returns {URL}
 */
export function buildSubdomainLegacyCollectionRedirectUrl(requestUrl) {
  const url = new URL(requestUrl.toString());
  url.pathname = SHOP_COLLECTION_PATH;
  return url;
}
