/**
 * Explicit width/height for product <img> elements (CLS + image crawl hints).
 * Does not change URLs, ALT, or CDN behavior.
 */

export const PRODUCT_THUMB_100_PX = 100;
export const PRODUCT_THUMB_400_PX = 400;
export const PDP_MAIN_ASPECT = { width: 4, height: 3 };
export const PRODUCT_CARD_SQUARE_PX = 400;
export const PDP_GALLERY_THUMB_PX = 72;

/**
 * @param {string | null | undefined} url
 * @returns {{ width: number, height: number } | null}
 */
export function inferDimensionsFromProductImageUrl(url) {
  if (!url) return null;
  const text = String(url);
  if (/\/thumb_100_/i.test(text)) {
    return { width: PRODUCT_THUMB_100_PX, height: PRODUCT_THUMB_100_PX };
  }
  if (/\/thumb_400_/i.test(text)) {
    return { width: PRODUCT_THUMB_400_PX, height: PRODUCT_THUMB_400_PX };
  }
  return null;
}

/**
 * @typedef {'square' | 'thumb100' | 'thumb400' | 'pdp-main' | 'pdp-thumb'} ProductImageLayout
 */

/**
 * @param {{
 *   src?: string | null,
 *   url?: string | null,
 *   width?: number | string | null,
 *   height?: number | string | null,
 *   layout?: ProductImageLayout | null,
 * }} [input]
 * @returns {{ width: number, height: number } | null}
 */
export function resolveProductImageDimensions(input = {}) {
  const imageUrl = input.src ?? input.url ?? "";
  const widthNum = Number(input.width);
  const heightNum = Number(input.height);

  if (Number.isFinite(widthNum) && widthNum > 0 && Number.isFinite(heightNum) && heightNum > 0) {
    return { width: Math.round(widthNum), height: Math.round(heightNum) };
  }

  const fromUrl = inferDimensionsFromProductImageUrl(imageUrl);
  if (fromUrl) return fromUrl;

  switch (input.layout) {
    case "thumb100":
      return { width: PRODUCT_THUMB_100_PX, height: PRODUCT_THUMB_100_PX };
    case "thumb400":
      return { width: PRODUCT_THUMB_400_PX, height: PRODUCT_THUMB_400_PX };
    case "pdp-main":
      return { ...PDP_MAIN_ASPECT };
    case "pdp-thumb":
      return { width: PDP_GALLERY_THUMB_PX, height: PDP_GALLERY_THUMB_PX };
    case "square":
      return { width: PRODUCT_CARD_SQUARE_PX, height: PRODUCT_CARD_SQUARE_PX };
    default:
      return null;
  }
}

/**
 * Spread onto <img> for product surfaces.
 *
 * @param {Parameters<typeof resolveProductImageDimensions>[0]} input
 * @returns {{ width?: number, height?: number }}
 */
export function productImageDimensionProps(input = {}) {
  const dims = resolveProductImageDimensions(input);
  if (!dims) return {};
  return { width: dims.width, height: dims.height };
}
