/**
 * Server-side canonical product slug/url — preserves marketplace navigation
 * context from query params; never redirects listing clicks to wrong fitment.
 */

import {
  appendMarketplaceContextQuery,
  isEmptyMarketplaceContext,
  parseMarketplaceContextFromQuery,
} from "@/lib/marketplace/marketplaceContext";
import { buildProductSeoSlug, buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

const MARKETPLACE_NAV_QUERY_KEYS = ["vb", "vm", "vy", "cat", "pr", "__src"];

/**
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} searchParams
 */
export function hasMarketplaceNavigationQuery(searchParams) {
  if (!searchParams) return false;

  if (searchParams instanceof URLSearchParams) {
    return MARKETPLACE_NAV_QUERY_KEYS.some((key) => {
      const value = searchParams.get(key);
      return value != null && String(value).trim() !== "";
    });
  }

  if (typeof searchParams === "object") {
    return MARKETPLACE_NAV_QUERY_KEYS.some((key) => {
      const raw = searchParams[key];
      const value = Array.isArray(raw) ? raw[0] : raw;
      return value != null && String(value).trim() !== "";
    });
  }

  return false;
}

/**
 * @param {Record<string, unknown>} product
 * @param {unknown[] | null | undefined} cars
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} [searchParams]
 */
export function buildServerCanonicalSlugInput(product, cars, searchParams) {
  const marketplaceContext = parseMarketplaceContextFromQuery(searchParams);
  const hasContext = !isEmptyMarketplaceContext(marketplaceContext);
  const marketplaceNav =
    hasContext || hasMarketplaceNavigationQuery(searchParams);

  return {
    ...product,
    cars,
    ...(hasContext ? { marketplaceContext } : {}),
    ...(marketplaceNav && !hasContext
      ? { suppressUnsafeVehicleFallback: true }
      : {}),
  };
}

/**
 * @param {Record<string, unknown>} product
 * @param {unknown[] | null | undefined} cars
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} [searchParams]
 */
export function buildServerCanonicalProductSlug(product, cars, searchParams) {
  return buildProductSeoSlug(
    buildServerCanonicalSlugInput(product, cars, searchParams),
  );
}

/**
 * @param {Record<string, unknown>} product
 * @param {unknown[] | null | undefined} cars
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} [searchParams]
 */
export function buildServerCanonicalProductUrl(product, cars, searchParams) {
  const marketplaceContext = parseMarketplaceContextFromQuery(searchParams);
  const hasContext = !isEmptyMarketplaceContext(marketplaceContext);
  const slugInput = buildServerCanonicalSlugInput(product, cars, searchParams);

  const base = buildProductSeoUrl(
    slugInput,
    hasContext ? { marketplaceContext } : {},
  );

  if (isEmptyMarketplaceContext(marketplaceContext)) return base;
  return appendMarketplaceContextQuery(base, marketplaceContext);
}

/**
 * Canonical apex path `/<slug>-<id>` with optional marketplace query preserved.
 *
 * @param {Record<string, unknown>} product
 * @param {unknown[] | null | undefined} cars
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} [searchParams]
 */
export function buildServerCanonicalProductPath(product, cars, searchParams) {
  const slug = buildServerCanonicalProductSlug(product, cars, searchParams);
  const id = product?.id ?? product?.productId ?? product?.product_id;
  const path = slug ? `/${slug}-${id}` : `/p/${id}`;

  const marketplaceContext = parseMarketplaceContextFromQuery(searchParams);
  if (isEmptyMarketplaceContext(marketplaceContext)) return path;
  return appendMarketplaceContextQuery(path, marketplaceContext);
}
