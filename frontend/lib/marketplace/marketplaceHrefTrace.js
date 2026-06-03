/**
 * DEV-only marketplace product href tracing (P0 final trace).
 * Logs the FINAL href rendered / navigated and tags with __src= for DOM inspection.
 */

const IS_DEV = process.env.NODE_ENV !== "production";
const loggedKeys = new Set();

/**
 * @param {string} href
 * @param {string} src
 * @returns {string}
 */
export function appendDevHrefSourceMarker(href, src) {
  if (!IS_DEV || !href || href === "/" || !src) return href || "/";
  const marker = `__src=${encodeURIComponent(src)}`;
  if (href.includes(marker)) return href;
  return href.includes("?") ? `${href}&${marker}` : `${href}?${marker}`;
}

/**
 * Log + tag the final marketplace product href at the render/navigation site.
 *
 * @param {{
 *   src: string,
 *   href: string,
 *   item?: Record<string, unknown> | null,
 *   marketplaceContext?: Record<string, unknown> | null,
 * }} input
 * @returns {string} href with optional DEV __src marker
 */
export function traceRenderedProductHref({
  src,
  href,
  item = null,
  marketplaceContext = null,
}) {
  const finalHref = appendDevHrefSourceMarker(href, src);

  if (!IS_DEV) return finalHref;

  const productId =
    item?.id ?? item?.productId ?? item?.product_id ?? null;
  const logKey = `${src}:${productId}:${finalHref}`;
  if (!loggedKeys.has(logKey)) {
    loggedKeys.add(logKey);
    console.warn("[RenderedProductHref]", {
      src,
      productId,
      productName:
        item?.partName ||
        item?.shortDescription ||
        item?.name ||
        item?.title ||
        null,
      href: finalHref,
      rawHref: href,
      marketplaceContext: marketplaceContext || null,
      pathname:
        typeof window !== "undefined" ? window.location.pathname : null,
      hasCars: Array.isArray(item?.cars) && item.cars.length > 0,
      itemBrand: item?.brand ?? item?.hang_xe ?? null,
      itemModel: item?.model ?? item?.ten_xe ?? null,
    });
  }

  return finalHref;
}

/** Reset dedupe bucket — tests only. */
export function resetMarketplaceHrefTraceForTests() {
  loggedKeys.clear();
}
