/**
 * Derive "trusted inventory" signal chips for a product card from
 * REAL fields only. No view counts, no fabricated "X people just
 * asked" lines — every chip below maps back to a timestamp the
 * seller actually owns.
 *
 * Inputs (all optional, defensive against missing data):
 *   - product.createdAt
 *   - product.updatedAt  (surfaced when the API exposes it; falls
 *                         back to createdAt so we never invent
 *                         "Cập nhật hôm nay" out of thin air)
 *
 * Output: array of `{ kind, label, tone }`. Empty array when no
 * signal qualifies — caller renders nothing. Capped at TWO signals
 * so the card layout stays calm.
 *
 * Rules:
 *   - "Cập nhật hôm nay" wins when updatedAt is within the last 24h
 *     AND differs from createdAt (a fresh edit, not the initial
 *     create event echoed by some APIs).
 *   - "Mới đăng" wins when createdAt is within the last 7 days.
 *   - The two NEVER co-exist on the same card — only the strongest
 *     wins, otherwise we trade visual noise for no extra signal.
 *
 * Performance: pure function, sync, no allocations beyond the return
 * array. Safe to call from the SSR render loop for every card.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function parseTs(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const n = Number(v);
  if (Number.isFinite(n) && n > 1_000_000_000) {
    // Looks like an epoch (s or ms). Treat 10-digit as seconds.
    return n < 1e12 ? n * 1000 : n;
  }
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

export function deriveProductInventorySignals(product, now = Date.now()) {
  if (!product) return [];
  const created = parseTs(product.createdAt);
  const updated = parseTs(product.updatedAt) || created;
  const signals = [];

  if (updated && created && updated - created > 60 * 1000 && now - updated <= DAY_MS) {
    signals.push({
      kind: "updated_today",
      label: "Cập nhật hôm nay",
      tone: "emerald",
    });
  } else if (created && now - created <= 7 * DAY_MS) {
    signals.push({
      kind: "new",
      label: "Mới đăng",
      tone: "blue",
    });
  }

  return signals.slice(0, 2);
}

export const INVENTORY_SIGNAL_TONES = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  gray: "bg-gray-50 text-gray-700 ring-gray-200",
};
