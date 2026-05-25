/**
 * resolveShopZalo — client-side mirror of `backend/utils/resolveShopZalo.js`.
 *
 * Why duplicate the helper instead of importing one?
 * The frontend bundle must NOT pull from `/backend` (different build
 * target, no node-only deps). Keeping a tiny mirror here means every
 * UI surface — header CTA, contact card, mobile sticky CTA, JSON-LD,
 * the settings preview — normalizes the same way the API does.
 *
 * Priority (matches the backend exactly):
 *   1. shop.zalo            — unified canonical
 *   2. shop.zalo_phone /
 *      shop.zaloPhone       — public-page fallback
 *   3. shop.phone           — only when `phoneFallback: true`
 *
 * Always returns a string (possibly "").
 */
function nonEmpty(v) {
  if (v == null) return "";
  const t = String(v).trim();
  return t || "";
}

export function resolveShopZalo(shop, { phoneFallback = false } = {}) {
  if (!shop || typeof shop !== "object") return "";
  return (
    nonEmpty(shop.zalo) ||
    nonEmpty(shop.zalo_phone) ||
    nonEmpty(shop.zaloPhone) ||
    (phoneFallback ? nonEmpty(shop.phone) : "")
  );
}
