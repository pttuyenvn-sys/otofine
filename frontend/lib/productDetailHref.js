import { buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

/**
 * Public product detail href (root-level canonical SEO format).
 *
 * Always returns `/<slug>-<id>` where the slug is computed from
 * whatever fields are available on `item`. When the caller has no
 * descriptive fields, the helper degrades to `/p/<id>` and the
 * dedicated redirect route at `app/p/[id]/page.js` 308-redirects to
 * the proper canonical on first request.
 *
 * Callers should pass the FULL item shape they have on hand (name /
 * partName / brand / model / year / partNumber / cars[]) so the
 * generated URL matches the page-canonical and the click is a single
 * direct render — no redirect.
 *
 * @param {{ id?: string | number; productId?: string | number } & Record<string, unknown>} item
 * @returns {string}
 */
export function getProductDetailHref(item) {
  if (!item) return "/";
  return buildProductSeoUrl(item);
}
