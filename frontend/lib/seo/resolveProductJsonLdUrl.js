import { absoluteUrl } from "@/lib/seo/siteUrl";
import { buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

function normalizeAbsoluteUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

/**
 * JSON-LD product URL: backend owner first, local builder fallback.
 *
 * Priority:
 *   1. data.canonicalUrl (absolute, from API)
 *   2. data.canonicalPath → absoluteUrl(path)
 *   3. buildProductSeoUrl({ ...product, cars })
 *
 * @param {{ product?: Record<string, unknown>; cars?: unknown[]; canonicalUrl?: string; canonicalPath?: string } | null | undefined} data
 * @returns {string}
 */
export function resolveProductJsonLdUrl(data) {
  const fromApi = normalizeAbsoluteUrl(data?.canonicalUrl);
  if (fromApi) return fromApi;

  const path = String(data?.canonicalPath ?? "").trim();
  if (path.startsWith("/")) return absoluteUrl(path);

  const p = data?.product;
  if (p) {
    return absoluteUrl(buildProductSeoUrl({ ...p, cars: data.cars }));
  }

  return absoluteUrl("/");
}

/**
 * @param {{ product?: Record<string, unknown>; cars?: unknown[]; canonicalUrl?: string; canonicalPath?: string } | null | undefined} data
 * @returns {"canonicalUrl" | "canonicalPath" | "fallback"}
 */
export function resolveProductJsonLdUrlSource(data) {
  if (normalizeAbsoluteUrl(data?.canonicalUrl)) return "canonicalUrl";
  const path = String(data?.canonicalPath ?? "").trim();
  if (path.startsWith("/")) return "canonicalPath";
  return "fallback";
}
