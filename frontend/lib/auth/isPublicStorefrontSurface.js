/**
 * SHOP-AUTH-DECOUPLE-01 — client-side public storefront surface detection.
 *
 * Public storefront pages must never trigger seller login redirects when
 * shop auth expires. Seller workspace routes keep the existing redirect.
 *
 * PUBLIC (no auth redirect on 401):
 *   - https://{slug}.otofine.com/*  (wildcard shop subdomain, non-seller paths)
 *   - https://otofine.com/shops/{slug}/*
 *   - /shop-demo (Phase 1 demo storefront)
 *
 * SELLER (auth redirect on 401 allowed):
 *   - /shop, /shop/*
 *   - /rfq/shop, /rfq/shop/*
 *   - marketplace and all other routes
 */

import { classifyHost, HOST_DECISIONS } from "@/lib/shopHost";

const SELLER_PATH_PREFIXES = ["/shop", "/rfq/shop"];

function isSellerWorkspacePath(pathname) {
  const path = pathname || "/";
  if (path === "/shop") return true;
  return SELLER_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function isApexStorefrontPath(pathname) {
  const path = pathname || "/";
  if (path === "/shop-demo" || path.startsWith("/shop-demo/")) return true;
  return path === "/shops" || path.startsWith("/shops/");
}

/**
 * True when the current browser location is a public shop storefront
 * surface (customer-first). Safe to call only in the browser.
 *
 * @returns {boolean}
 */
export function isPublicStorefrontSurface() {
  if (typeof window === "undefined") return false;

  const pathname = window.location.pathname || "/";
  if (isSellerWorkspacePath(pathname)) return false;
  if (isApexStorefrontPath(pathname)) return true;

  const { decision } = classifyHost(window.location.hostname || "");
  return decision === HOST_DECISIONS.REWRITE_OK;
}

/**
 * True when a failed shop refresh should hard-redirect to /shop/login.
 * Inverse of {@link isPublicStorefrontSurface} on the client; defaults
 * to true during SSR so server paths keep seller semantics.
 *
 * @returns {boolean}
 */
export function isSellerAuthRedirectSurface() {
  if (typeof window === "undefined") return true;
  return !isPublicStorefrontSurface();
}
