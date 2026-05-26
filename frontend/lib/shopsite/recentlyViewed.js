/**
 * Shared "recently viewed products" localStorage helper.
 *
 * Why a separate module:
 *   `ProductDetail.jsx` has been writing to this localStorage slot
 *   for a while (see `RECENT_VIEWED_KEY`). The new storefront strip
 *   needs to READ from the same slot — copy-pasting the key string
 *   into two files is a foot-gun (the moment we bump the version
 *   we'd silently fork the data). Centralising it here lets both
 *   sides share the same key, schema, and pruning rules.
 *
 * Contract:
 *   - Pure client-side (no SSR access, no fetch). All readers must
 *     guard with `typeof window !== "undefined"` themselves; the
 *     helper short-circuits to `[]` / `noop` in non-DOM contexts.
 *   - Max 12 entries — oldest entries dropped on push.
 *   - Newest first. Dedupe is by `id` (numeric); a re-visit moves
 *     the existing entry to the head instead of duplicating.
 *   - Entries are intentionally small (id, slug, title, price label,
 *     image, partNumber, timestamp). The full DTO isn't retained.
 *
 * Schema bump policy:
 *   Bump the version suffix (`_v1` → `_v2`) when the entry shape
 *   changes incompatibly. Old keys are NOT migrated — they simply
 *   become unreadable, and the UI degrades to "no recently viewed".
 *   This is acceptable given the throwaway nature of the data.
 */

export const RECENT_VIEWED_KEY = "otofine_recent_products_v1";

const MAX_ENTRIES = 12;

function safeParse(json) {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * @returns {Array<{ id: number|string, slug?: string|null, title?: string, image?: string,
 *                   partNumber?: string, priceLabel?: string, at?: number }>}
 */
export function readRecentlyViewed() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_VIEWED_KEY);
    return safeParse(raw).slice(0, MAX_ENTRIES);
  } catch {
    // Private mode / disabled storage — degrade silently.
    return [];
  }
}

/**
 * Append an entry to the front of the list, dedupe by id, cap at
 * `MAX_ENTRIES`. Returns the new array (post-write) so the caller
 * can sync its own state in the same tick without re-reading.
 *
 * Entries with no `id` are dropped silently (we never want to push
 * a partial record that the consumer can't link out from).
 *
 * @param {object} entry  partial product shape (see schema above)
 * @returns {Array}
 */
export function pushRecentlyViewed(entry) {
  if (typeof window === "undefined") return [];
  if (!entry || entry.id == null) return readRecentlyViewed();
  const prev = readRecentlyViewed();
  const id = String(entry.id);
  const next = [
    { ...entry, at: Date.now() },
    ...prev.filter((x) => x && String(x.id) !== id),
  ].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(next));
  } catch {/* quota / private mode */}
  return next;
}

/**
 * Filter helper for "show recently viewed EXCEPT this one product"
 * — useful on the product detail page where the current product is
 * already the hero.
 */
export function excludeCurrent(arr, currentId) {
  if (!Array.isArray(arr)) return [];
  if (currentId == null) return arr;
  const cid = String(currentId);
  return arr.filter((x) => x && String(x.id) !== cid);
}
