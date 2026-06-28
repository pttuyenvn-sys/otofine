import { buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

function normalizeCanonicalPath(path) {
  if (path == null) return "";
  const s = String(path).trim();
  return s.startsWith("/") ? s : "";
}

/**
 * Public product detail href (root-level canonical SEO format).
 *
 * Prefers `item.canonicalPath` from the backend API (ARCH-01H) when
 * present. Falls back to local `buildProductSeoUrl` for legacy payloads
 * or cached rows without canonical fields.
 *
 * @param {{ id?: string | number; productId?: string | number; canonicalPath?: string } & Record<string, unknown>} item
 * @returns {string}
 */
export function getProductDetailHref(item) {
  if (!item) return "/";
  const fromApi = normalizeCanonicalPath(item.canonicalPath);
  if (fromApi) return fromApi;
  const fromIdentity = normalizeCanonicalPath(item.productIdentity?.canonicalPath);
  if (fromIdentity) return fromIdentity;
  return buildProductSeoUrl(item);
}
