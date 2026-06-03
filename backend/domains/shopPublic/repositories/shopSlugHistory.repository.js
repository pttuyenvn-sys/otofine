import { pool } from "../../../config/db.js";

const MAX_REDIRECT_HOPS = 10;

/**
 * Record a slug rename for redirect resolution. Additive only.
 */
export async function insertSlugHistory(shopId, oldSlug, newSlug) {
  const sid = Number(shopId);
  const oldS = String(oldSlug || "").trim().toLowerCase();
  const newS = String(newSlug || "").trim().toLowerCase();
  if (!sid || !oldS || !newS || oldS === newS) return;

  await pool.query(
    `
      INSERT INTO shop_slug_history (shop_id, old_slug, new_slug)
      VALUES (?, ?, ?)
    `,
    [sid, oldS, newS],
  );
}

/**
 * Resolve an old slug to the current public slug by following rename
 * history. Returns null when no redirect applies or a loop is detected.
 */
export async function resolveSlugRedirectTarget(fromSlug) {
  const start = String(fromSlug || "").trim().toLowerCase();
  if (!start) return null;

  const visited = new Set([start]);
  let current = start;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
    const [rows] = await pool.query(
      `
        SELECT new_slug AS newSlug
        FROM shop_slug_history
        WHERE old_slug = ?
        ORDER BY changed_at DESC, id DESC
        LIMIT 1
      `,
      [current],
    );
    const next = String(rows[0]?.newSlug || "").trim().toLowerCase();
    if (!next || next === current) break;
    if (visited.has(next)) return null;
    visited.add(next);
    current = next;
  }

  return current !== start ? current : null;
}
