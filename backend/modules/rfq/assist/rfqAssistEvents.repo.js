import { pool } from "../../../config/db.js";

/**
 * Phase 8.2 — RFQ Assist: event repository.
 *
 * Thin SQL wrapper around `rfq_assist_events`. Three responsibilities:
 *
 *   1. Recording — INSERT one row per (impression | click | selected
 *      | deselected | dismissed) event. Idempotency NOT enforced
 *      (analytics tolerates duplicates; impression dedup happens
 *      client-side via IntersectionObserver one-shot).
 *
 *   2. Per-RFQ cap — soft guard that prevents an abusive client from
 *      writing megabytes into one RFQ's audit trail. Returns the
 *      current count when the cap is exceeded so the caller can 204
 *      gracefully.
 *
 *   3. Read paths — small helpers used by future ops dashboards.
 *      Not consumed by hot paths.
 *
 * All writes are best-effort. The service layer that calls into
 * here catches and logs errors so an analytics failure NEVER blocks
 * the buyer's RFQ flow.
 */

/**
 * Hard upper bound on events stored per single RFQ. ~200 covers any
 * realistic UX: ≤ 10 suggestions × {impression, click, selected,
 * deselected, dismissed} ≈ 50; the rest is headroom for genuine
 * re-engagement loops. Beyond this we silently drop.
 */
export const MAX_EVENTS_PER_RFQ = 200;

const ACTION_VALUES = new Set([
  "impression",
  "click",
  "selected",
  "deselected",
  "dismissed",
]);

const TIER_VALUES = new Set(["hot", "warm", "cold"]);

export function isValidAction(a) {
  return ACTION_VALUES.has(String(a || "").toLowerCase());
}

export function isValidTier(t) {
  return t == null || TIER_VALUES.has(String(t || "").toLowerCase());
}

/**
 * Record a single assist event. Returns:
 *   - { ok: true, id }                          — inserted
 *   - { ok: false, reason: "rfq-cap-exceeded" } — soft cap hit
 *   - throws on hard DB failure (caller logs + swallows)
 */
export async function insertAssistEvent({
  rfqRequestId,
  suggestedShopId = null,
  action,
  source = "viewer",
  matchScore = null,
  matchTier = null,
  buyerPhoneHash = null,
  metadata = null,
}) {
  if (!isValidAction(action)) {
    throw new Error("INVALID_ASSIST_ACTION");
  }
  if (!isValidTier(matchTier)) {
    throw new Error("INVALID_ASSIST_TIER");
  }

  const rid = Number(rfqRequestId);
  if (!Number.isFinite(rid) || rid <= 0) {
    throw new Error("INVALID_RFQ_REQUEST_ID");
  }

  const cap = await countEventsForRfq(rid);
  if (cap >= MAX_EVENTS_PER_RFQ) {
    return { ok: false, reason: "rfq-cap-exceeded", count: cap };
  }

  const shopId =
    suggestedShopId == null || suggestedShopId === ""
      ? null
      : Number(suggestedShopId);
  const score =
    matchScore == null || matchScore === ""
      ? null
      : Math.max(0, Math.min(255, Math.floor(Number(matchScore))));

  const [result] = await pool.query(
    `INSERT INTO rfq_assist_events
       (rfq_request_id, suggested_shop_id, action, source,
        match_score, match_tier, buyer_phone_hash, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rid,
      Number.isFinite(shopId) && shopId > 0 ? shopId : null,
      String(action).toLowerCase(),
      String(source || "viewer").slice(0, 32),
      Number.isFinite(score) ? score : null,
      matchTier ? String(matchTier).toLowerCase() : null,
      buyerPhoneHash ? String(buyerPhoneHash).slice(0, 64) : null,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );

  return { ok: true, id: Number(result.insertId) };
}

export async function countEventsForRfq(rfqRequestId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c FROM rfq_assist_events WHERE rfq_request_id = ?`,
    [Number(rfqRequestId)],
  );
  return Number(row?.c || 0);
}

/**
 * Ops-friendly read: pull recent assist activity for one RFQ.
 * Capped at 200 rows (matches per-RFQ insert cap).
 */
export async function listEventsForRfq(rfqRequestId, { limit = 50 } = {}) {
  const lim = Math.max(1, Math.min(MAX_EVENTS_PER_RFQ, Number(limit) || 50));
  const [rows] = await pool.query(
    `SELECT id, suggested_shop_id, action, source, match_score, match_tier,
            metadata_json, created_at
       FROM rfq_assist_events
      WHERE rfq_request_id = ?
      ORDER BY id DESC
      LIMIT ?`,
    [Number(rfqRequestId), lim],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    shopId: r.suggested_shop_id != null ? Number(r.suggested_shop_id) : null,
    action: r.action,
    source: r.source,
    matchScore: r.match_score != null ? Number(r.match_score) : null,
    matchTier: r.match_tier || null,
    metadata: r.metadata_json || null,
    createdAt: r.created_at,
  }));
}
