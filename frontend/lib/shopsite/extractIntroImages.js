/**
 * Pull image URLs out of an HTML blob written by the seller in the
 * storefront intro editor (Tiptap).
 *
 * Used by the storefront-visuals resolver to surface real shop-specific
 * imagery (warehouse, garage, packaging) as fallback candidates for
 * the homepage promo + about hero — so the storefront doesn't keep
 * reusing the same cover image in every hero slot.
 *
 * Contract:
 *   - input is whatever the editor produced; sanitised HTML lives in
 *     `shop.introHtml` already.
 *   - we DO NOT execute the HTML, we DO NOT trust the result for
 *     anything except `src` attributes that look like absolute URLs.
 *   - returns an ordered, de-duplicated array of URLs (order matches
 *     visual order in the intro page).
 *   - SSR-safe: pure regex, no DOM access.
 */

const IMG_TAG_RE = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;

export function extractIntroImages(html) {
  if (!html || typeof html !== "string") return [];
  const out = [];
  const seen = new Set();
  let match;
  IMG_TAG_RE.lastIndex = 0;
  while ((match = IMG_TAG_RE.exec(html)) !== null) {
    const raw = (match[1] || match[2] || match[3] || "").trim();
    if (!raw) continue;
    // Only absolute http(s) / protocol-relative URLs survive — drop
    // `data:` blobs and relative paths so we never feed something
    // hostile into a layout-level <img src>.
    if (!/^(https?:)?\/\//i.test(raw) && !raw.startsWith("/")) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}
