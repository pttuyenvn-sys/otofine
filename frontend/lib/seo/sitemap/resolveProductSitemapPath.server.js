import { buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

/**
 * Product sitemap path: prefer backend canonicalPath (ARCH-01H), fallback
 * to local builder for legacy/offline payloads.
 */
export function resolveProductSitemapPath(product, id) {
  const cp = String(product?.canonicalPath ?? "").trim();
  if (cp.startsWith("/")) return cp;
  return buildProductSeoUrl({
    id,
    partName: product.partName,
    partNumber: product.partNumber,
    cars: product.cars,
  });
}
