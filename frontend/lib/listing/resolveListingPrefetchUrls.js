import { getProductImageUrl } from "@/lib/media/productMediaUrl";
import { resolveListingImageVariant } from "@/lib/media/listingProductImageVariant";

/**
 * Resolve the CDN thumb URL used on listing cards for prefetch.
 *
 * @param {string|null|undefined} catalogUrl
 * @param {"grid"|"compact"|"large"} [slot]
 * @param {number|null|undefined} [viewportWidth]
 */
export function resolveListingCardPrefetchUrl(
  catalogUrl,
  slot = "grid",
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : null,
) {
  const variant = resolveListingImageVariant(slot, viewportWidth);
  return getProductImageUrl(catalogUrl, variant) || "";
}

/**
 * @param {Array<{ image?: string|null, image_url?: string|null }>} items
 * @param {number} fromIndex
 * @param {number} count
 * @param {"grid"|"compact"|"large"} [slot]
 */
export function collectListingPrefetchUrls(
  items,
  fromIndex,
  count,
  slot = "grid",
) {
  if (!Array.isArray(items) || count <= 0) return [];

  const width = typeof window !== "undefined" ? window.innerWidth : null;
  const slice = items.slice(fromIndex, fromIndex + count);

  return slice
    .map((item) =>
      resolveListingCardPrefetchUrl(
        item?.image || item?.image_url,
        slot,
        width,
      ),
    )
    .filter(Boolean);
}
