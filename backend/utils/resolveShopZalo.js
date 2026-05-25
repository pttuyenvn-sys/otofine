/**
 * resolveShopZalo — canonical Zalo contact normalization.
 *
 * Background
 * ----------
 * The `shops` table carries TWO columns that have drifted across the
 * Phase A settings merge:
 *
 *   - `zalo`        legacy (original) column. Written by the basic
 *                   info form via `PUT /api/shop/me`. Also used by
 *                   RFQ Zalo OA escalation (`services/zalo.service.js`).
 *   - `zalo_phone`  additive column introduced by migration 040 for
 *                   the public-page contact form. Written by
 *                   `PUT /api/shop/public-page`.
 *
 * After the unified settings page started writing to both endpoints,
 * users could leave one column stale and the other fresh. The bug
 * surfaced as: `/shop/settings` showed the new value while the
 * storefront kept rendering the old one.
 *
 * Resolution policy
 * -----------------
 * The unified settings UI is the source of truth, and its Basic-tab
 * field maps to `zalo`. So the priority is:
 *
 *   1. `shop.zalo`           — unified canonical
 *   2. `shop.zalo_phone`     — public-page fallback
 *   3. (optional) `shop.phone` — only when the caller asked
 *
 * Backwards-compatible
 * --------------------
 * - Accepts both snake_case (`zalo_phone`) and camelCase (`zaloPhone`)
 *   so the helper works against raw DB rows AND projected DTOs.
 * - Empty strings and whitespace-only strings count as "missing".
 * - Never returns `null`/`undefined` — always a string (possibly "").
 *
 * Read-write symmetry
 * -------------------
 * Backend controllers that write `zalo` mirror it into `zalo_phone`
 * (and vice-versa). That gives us "in-sync" rows going forward.
 * Until the backfill completes, this helper guarantees correct render
 * behaviour on already-drifted rows.
 */

function pickNonEmpty(...candidates) {
  for (const v of candidates) {
    if (v == null) continue;
    const trimmed = String(v).trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * @param {object} shop                 raw row or projected DTO
 * @param {object} [opts]
 * @param {boolean} [opts.phoneFallback=false]  also try `shop.phone` as last resort
 * @returns {string} trimmed Zalo contact, or "" if none
 */
export function resolveShopZalo(shop, { phoneFallback = false } = {}) {
  if (!shop || typeof shop !== "object") return "";
  const direct = pickNonEmpty(
    shop.zalo,
    shop.zalo_phone,
    shop.zaloPhone,
  );
  if (direct) return direct;
  if (phoneFallback) return pickNonEmpty(shop.phone);
  return "";
}

/**
 * Returns `{ zalo, zalo_phone }` for write-path symmetry. Given the
 * inputs of a single save (potentially only one of the two), this
 * computes the mirrored value to persist into the other column.
 *
 * @example
 *   computeZaloMirror({ zalo: "0901234567" })
 *     → { zalo: "0901234567", zalo_phone: "0901234567" }
 *   computeZaloMirror({ zaloPhone: "0901234567" })
 *     → { zalo: "0901234567", zalo_phone: "0901234567" }
 *   computeZaloMirror({})       → null  // caller should write nothing
 *   computeZaloMirror({ zalo: "" }) → { zalo: null, zalo_phone: null }
 */
export function computeZaloMirror(input = {}) {
  const hasZalo = Object.prototype.hasOwnProperty.call(input, "zalo");
  const hasPhone =
    Object.prototype.hasOwnProperty.call(input, "zalo_phone") ||
    Object.prototype.hasOwnProperty.call(input, "zaloPhone");
  if (!hasZalo && !hasPhone) return null;
  const v = resolveShopZalo({
    zalo: input.zalo,
    zalo_phone: input.zalo_phone,
    zaloPhone: input.zaloPhone,
  });
  return { zalo: v || null, zalo_phone: v || null };
}
