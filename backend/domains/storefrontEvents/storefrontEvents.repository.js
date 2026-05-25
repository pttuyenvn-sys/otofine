import { pool } from "../../config/db.js";

/**
 * Append-only data access for `shop_storefront_events`.
 *
 * This repository is read by the seller-side `/api/shop/metrics/overview`
 * aggregator and written by the public `/api/storefront-events/track`
 * ingest endpoint. There is intentionally no UPDATE path; the table
 * is observational only.
 *
 * Both queries are explicit, single-statement aggregates so a heavy
 * storefront day cannot turn the metrics dashboard into an N+1 hot
 * loop. Indexes are covered by migration 043:
 *   KEY idx_sse_shop_type_at (shop_id, event_type, occurred_at)
 *   KEY idx_sse_type_at      (event_type, occurred_at)
 */

/** Whitelisted event types the public ingest endpoint will accept. */
export const ALLOWED_STOREFRONT_EVENT_TYPES = Object.freeze([
  "storefront_view",
  "product_click",
  "phone_click",
  "zalo_click",
  "facebook_click",
  "share_click",
  "share_complete",
  "share_copy",
  "rfq_cta_click",
]);

/** Event types that count as "storefront CTA clicks" in the seller dashboard. */
export const CTA_EVENT_TYPES = Object.freeze(["phone_click", "zalo_click"]);

/**
 * Insert a single event row. Caller has already validated event_type
 * and resolved shop_slug → shop_id.
 *
 * Metadata is stored as JSON; falsy → NULL so MySQL can compress the
 * page block.
 */
export async function insertStorefrontEvent({ shopId, eventType, metadata = null }) {
  const meta = metadata && typeof metadata === "object" ? JSON.stringify(metadata) : null;
  await pool.query(
    `INSERT INTO shop_storefront_events (shop_id, event_type, metadata_json)
     VALUES (?, ?, ?)`,
    [shopId, eventType, meta],
  );
}

/**
 * Return event counts grouped by type for a single shop, over a
 * trailing window. ONE query — no N+1 even with dozens of event
 * types.
 *
 * Returns a plain object keyed by event_type:
 *   { phone_click: 12, zalo_click: 8, storefront_view: 134, ... }
 *
 * Missing types are absent from the result (callers default to 0).
 */
export async function countShopEventsByType(shopId, { sinceDays = 30 } = {}) {
  if (!shopId) return {};
  const [rows] = await pool.query(
    `SELECT event_type, COUNT(*) AS c
       FROM shop_storefront_events
      WHERE shop_id = ?
        AND occurred_at >= (NOW(3) - INTERVAL ? DAY)
      GROUP BY event_type`,
    [shopId, sinceDays],
  );
  const out = {};
  for (const r of rows) out[r.event_type] = Number(r.c) || 0;
  return out;
}
