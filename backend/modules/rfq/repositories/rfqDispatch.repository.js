import { pool } from "../../../config/db.js";
import { rfqDispatchTuning } from "../../../config/rfq.config.js";
import { parseInboxFilterQuery } from "../utils/rfqVehicleNormalize.js";
import { buildPublicProductWhereClause } from "../../../modules/products/services/productPublicVisibility.server.js";

/** Active RFQ/dispatch — same semantics as countInboxUnread. */
const ACTIVE_RFQ_SQL = `
  d.status NOT IN ('expired','failed','skipped')
  AND (r.expires_at IS NULL OR r.expires_at > NOW(3))
  AND r.status NOT IN ('expired','cancelled','closed')
`;

const QUOTE_SUBMITTED_EXISTS = `
  EXISTS (
    SELECT 1 FROM rfq_quotes q
    WHERE q.dispatch_id = d.id AND q.deleted_at IS NULL AND q.status = 'submitted'
  )
`;

function applyInboxStatusFilter(filter, where) {
  if (filter === "unread") {
    where.push(`d.first_viewed_at IS NULL`);
    where.push(ACTIVE_RFQ_SQL);
  } else if (filter === "quoted") {
    where.push(`(d.status = 'quoted' OR ${QUOTE_SUBMITTED_EXISTS})`);
  } else if (filter === "waiting") {
    where.push(ACTIVE_RFQ_SQL);
    where.push(`NOT (${QUOTE_SUBMITTED_EXISTS})`);
  } else if (filter === "expired") {
    where.push(`(
       d.status = 'expired'
       OR d.status = 'failed'
       OR (d.respond_by IS NOT NULL AND d.respond_by < NOW(3))
       OR (r.expires_at IS NOT NULL AND r.expires_at < NOW(3))
       OR r.status IN ('expired','cancelled','closed')
     )`);
  }
}

/**
 * Vehicle/category filters use STORED generated cols (migration 028) — indexed, aligned
 * with normalized buyer vehicle_json. Future conversation routing should reuse these keys.
 */
function applyInboxVehicleFilters(vehicleFilters, where, params) {
  const { brand, model, year, categoryKey } = vehicleFilters;
  if (brand) {
    where.push(`r.vehicle_brand_norm = ?`);
    params.push(brand);
  }
  if (model) {
    where.push(`r.vehicle_model_norm = ?`);
    params.push(model);
  }
  if (year != null) {
    where.push(`r.vehicle_year = ?`);
    params.push(year);
  }
  if (categoryKey) {
    where.push(`LOWER(TRIM(COALESCE(r.category_key, ''))) = ?`);
    params.push(categoryKey);
  }
}

export async function insertDispatch(conn, row) {
  const c = conn || pool;
  const [r] = await c.query(
    `INSERT INTO rfq_dispatches (
       rfq_request_id, shop_id, wave, status, escalation_level,
       web_notified_at, match_score, respond_by
     ) VALUES (?,?,?,?,?,?,?,?)`,
    [
      row.rfq_request_id,
      row.shop_id,
      row.wave ?? 1,
      row.status ?? "web_notified",
      row.escalation_level ?? 1,
      row.web_notified_at ?? new Date(),
      row.match_score ?? null,
      row.respond_by ?? null,
    ],
  );
  return r.insertId;
}

export async function listInboxForShop(shopId, opts = {}) {
  const limit = Math.min(Number(opts.limit) || 50, 50);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  const filter = String(opts.filter || "all").toLowerCase();
  const sort = String(opts.sort || "activity").toLowerCase();
  const vehicleFilters = parseInboxFilterQuery(opts);

  const where = [`d.shop_id = ?`, `r.deleted_at IS NULL`, `COALESCE(r.spam_flag, 0) = 0`];
  const params = [shopId];

  applyInboxStatusFilter(filter, where);
  applyInboxVehicleFilters(vehicleFilters, where, params);

  let orderBy;
  if (sort === "recent") {
    orderBy = `d.web_notified_at DESC, d.id DESC`;
  } else if (sort === "sla") {
    orderBy = `CASE WHEN d.first_viewed_at IS NULL THEN 0 ELSE 1 END ASC,
      (d.respond_by IS NULL) ASC,
      d.respond_by ASC,
      d.web_notified_at DESC`;
  } else {
    orderBy = `(d.first_viewed_at IS NULL) DESC,
      (
        SELECT COUNT(m.id)
        FROM rfq_conversations conv
        LEFT JOIN rfq_conversation_reads cr
          ON cr.conversation_id = conv.id
         AND cr.participant_type = 'shop'
         AND cr.participant_shop_id = d.shop_id
        LEFT JOIN rfq_messages m
          ON m.conversation_id = conv.id
         AND m.deleted_at IS NULL
         AND m.sender_type IN ('buyer', 'system')
         AND (cr.last_read_message_id IS NULL OR m.id > cr.last_read_message_id)
        WHERE conv.dispatch_id = d.id
      ) DESC,
      COALESCE(
        (
          SELECT m.created_at
          FROM rfq_conversations conv
          INNER JOIN rfq_messages m ON m.conversation_id = conv.id AND m.deleted_at IS NULL
          WHERE conv.dispatch_id = d.id
          ORDER BY m.id DESC
          LIMIT 1
        ),
        d.web_notified_at,
        d.created_at
      ) DESC,
      d.id DESC`;
  }

  const sql = `
    SELECT d.*, r.public_id, r.part_description, r.status AS rfq_status, r.vehicle_json,
           r.images_json,
           r.category_key, r.created_at AS rfq_created_at, r.expires_at AS rfq_expires_at,
           (${QUOTE_SUBMITTED_EXISTS}) AS has_submitted_quote,
           (
             SELECT m.message_type
             FROM rfq_conversations conv
             INNER JOIN rfq_messages m ON m.conversation_id = conv.id AND m.deleted_at IS NULL
             WHERE conv.dispatch_id = d.id
             ORDER BY m.id DESC
             LIMIT 1
           ) AS last_message_type,
           (
             SELECT m.message_text
             FROM rfq_conversations conv
             INNER JOIN rfq_messages m ON m.conversation_id = conv.id AND m.deleted_at IS NULL
             WHERE conv.dispatch_id = d.id
             ORDER BY m.id DESC
             LIMIT 1
           ) AS last_message_text,
           (
             SELECT m.sender_type
             FROM rfq_conversations conv
             INNER JOIN rfq_messages m ON m.conversation_id = conv.id AND m.deleted_at IS NULL
             WHERE conv.dispatch_id = d.id
             ORDER BY m.id DESC
             LIMIT 1
           ) AS last_message_sender_type,
           /*
            * Sales-intelligence enrichment (additive, seller-only).
            * Four scalar subselects derive the buyer-history signals
            * the inbox UI needs to flag HOT/WARM rows. All keyed off
            * rfq_requests.guest_phone_e164 so anonymous storefront
            * RFQs are correlated without a customer_profile_id, and
            * the IS NOT NULL guard prevents two unrelated NULL-phone
            * buyers from being treated as the same person.
            *
            *   buyer_prior_rfq_count    -> count of prior dispatches
            *   buyer_prior_last_rfq_at  -> newest prior dispatch time
            *   buyer_prior_quotes_count -> prior dispatches with quote
            *   buyer_prior_today        -> any prior dispatch today
            *
            * No new tables / indexes required.
            */
           (
             SELECT COUNT(*) FROM rfq_dispatches d2
             INNER JOIN rfq_requests r2 ON r2.id = d2.rfq_request_id
             WHERE d2.shop_id = d.shop_id
               AND d2.id <> d.id
               AND r2.guest_phone_e164 IS NOT NULL
               AND r2.guest_phone_e164 = r.guest_phone_e164
               AND r2.deleted_at IS NULL
               AND COALESCE(r2.spam_flag, 0) = 0
           ) AS buyer_prior_rfq_count,
           (
             SELECT MAX(d3.created_at) FROM rfq_dispatches d3
             INNER JOIN rfq_requests r3 ON r3.id = d3.rfq_request_id
             WHERE d3.shop_id = d.shop_id
               AND d3.id <> d.id
               AND r3.guest_phone_e164 IS NOT NULL
               AND r3.guest_phone_e164 = r.guest_phone_e164
               AND r3.deleted_at IS NULL
               AND COALESCE(r3.spam_flag, 0) = 0
           ) AS buyer_prior_last_rfq_at,
           (
             SELECT COUNT(DISTINCT d4.id) FROM rfq_dispatches d4
             INNER JOIN rfq_requests r4 ON r4.id = d4.rfq_request_id
             INNER JOIN rfq_quotes q4
               ON q4.dispatch_id = d4.id
              AND q4.deleted_at IS NULL
              AND q4.status = 'submitted'
             WHERE d4.shop_id = d.shop_id
               AND d4.id <> d.id
               AND r4.guest_phone_e164 IS NOT NULL
               AND r4.guest_phone_e164 = r.guest_phone_e164
               AND r4.deleted_at IS NULL
           ) AS buyer_prior_quotes_count,
           (
             SELECT MIN(1) FROM rfq_dispatches d5
             INNER JOIN rfq_requests r5 ON r5.id = d5.rfq_request_id
             WHERE d5.shop_id = d.shop_id
               AND d5.id <> d.id
               AND r5.guest_phone_e164 IS NOT NULL
               AND r5.guest_phone_e164 = r.guest_phone_e164
               AND r5.deleted_at IS NULL
               AND d5.created_at >= CURDATE()
           ) AS buyer_prior_today
    FROM rfq_dispatches d
    INNER JOIN rfq_requests r ON r.id = d.rfq_request_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function countInboxUnread(shopId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id
     WHERE d.shop_id = ?
       AND r.deleted_at IS NULL
       AND d.first_viewed_at IS NULL
       AND ${ACTIVE_RFQ_SQL}
       AND COALESCE(r.spam_flag, 0) = 0`,
    [shopId],
  );
  return Number(row?.c || 0);
}

/** Single round-trip badge counts for shop inbox header (no N+1). */
export async function countInboxBuckets(shopId) {
  const [[row]] = await pool.query(
    `SELECT
       SUM(
         CASE WHEN d.first_viewed_at IS NULL AND ${ACTIVE_RFQ_SQL} THEN 1 ELSE 0 END
       ) AS unread_count,
       SUM(
         CASE WHEN ${ACTIVE_RFQ_SQL} AND NOT (${QUOTE_SUBMITTED_EXISTS}) THEN 1 ELSE 0 END
       ) AS waiting_count,
       SUM(
         CASE WHEN (d.status = 'quoted' OR ${QUOTE_SUBMITTED_EXISTS}) THEN 1 ELSE 0 END
       ) AS quoted_count
     FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id
     WHERE d.shop_id = ?
       AND r.deleted_at IS NULL
       AND COALESCE(r.spam_flag, 0) = 0`,
    [shopId],
  );
  return {
    unread: Number(row?.unread_count || 0),
    waiting: Number(row?.waiting_count || 0),
    quoted: Number(row?.quoted_count || 0),
  };
}

/** All buyer-visible dispatches for an RFQ — chat rooms exist before quote submit. */
export async function listDispatchesForBuyerRequest(rfqRequestId, conn = null) {
  const c = conn || pool;
  const [rows] = await c.query(
    `SELECT d.id AS dispatch_id, d.shop_id, s.name AS shop_name
     FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id
     LEFT JOIN shops s ON s.id = d.shop_id
     WHERE d.rfq_request_id = ?
       AND r.deleted_at IS NULL
       AND COALESCE(r.spam_flag, 0) = 0
     ORDER BY d.id ASC`,
    [rfqRequestId],
  );
  return rows;
}

/** Idempotent — marks first shop engagement on a dispatch room. */
export async function markFirstShopMessageAt(conn, dispatchId) {
  await conn.query(
    `UPDATE rfq_dispatches
     SET first_shop_message_at = COALESCE(first_shop_message_at, NOW(3))
     WHERE id = ?`,
    [dispatchId],
  );
}

export async function findDispatchForShop(dispatchId, shopId) {
  const [[row]] = await pool.query(
    `SELECT d.*, r.public_id, r.part_description, r.status AS rfq_status, r.vehicle_json,
            r.images_json, r.created_at AS rfq_created_at, r.expires_at AS rfq_expires_at,
            /* Sales-intelligence enrichment — see listInboxForShop above.
             * Mirror the same four subselects so the chat pane sees
             * the same buyer-history signals as the inbox row. */
            (
              SELECT COUNT(*) FROM rfq_dispatches d2
              INNER JOIN rfq_requests r2 ON r2.id = d2.rfq_request_id
              WHERE d2.shop_id = d.shop_id
                AND d2.id <> d.id
                AND r2.guest_phone_e164 IS NOT NULL
                AND r2.guest_phone_e164 = r.guest_phone_e164
                AND r2.deleted_at IS NULL
                AND COALESCE(r2.spam_flag, 0) = 0
            ) AS buyer_prior_rfq_count,
            (
              SELECT MAX(d3.created_at) FROM rfq_dispatches d3
              INNER JOIN rfq_requests r3 ON r3.id = d3.rfq_request_id
              WHERE d3.shop_id = d.shop_id
                AND d3.id <> d.id
                AND r3.guest_phone_e164 IS NOT NULL
                AND r3.guest_phone_e164 = r.guest_phone_e164
                AND r3.deleted_at IS NULL
                AND COALESCE(r3.spam_flag, 0) = 0
            ) AS buyer_prior_last_rfq_at,
            (
              SELECT COUNT(DISTINCT d4.id) FROM rfq_dispatches d4
              INNER JOIN rfq_requests r4 ON r4.id = d4.rfq_request_id
              INNER JOIN rfq_quotes q4
                ON q4.dispatch_id = d4.id
               AND q4.deleted_at IS NULL
               AND q4.status = 'submitted'
              WHERE d4.shop_id = d.shop_id
                AND d4.id <> d.id
                AND r4.guest_phone_e164 IS NOT NULL
                AND r4.guest_phone_e164 = r.guest_phone_e164
                AND r4.deleted_at IS NULL
            ) AS buyer_prior_quotes_count,
            (
              SELECT MIN(1) FROM rfq_dispatches d5
              INNER JOIN rfq_requests r5 ON r5.id = d5.rfq_request_id
              WHERE d5.shop_id = d.shop_id
                AND d5.id <> d.id
                AND r5.guest_phone_e164 IS NOT NULL
                AND r5.guest_phone_e164 = r.guest_phone_e164
                AND r5.deleted_at IS NULL
                AND d5.created_at >= CURDATE()
            ) AS buyer_prior_today
     FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id
     WHERE d.id = ? AND d.shop_id = ? AND r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
     LIMIT 1`,
    [dispatchId, shopId],
  );
  return row || null;
}

/**
 * Race-safe view bump inside an open transaction (caller supplies conn).
 * Returns null if dispatch missing for shop.
 */
export async function markWebViewedTransactional(conn, dispatchId, shopId) {
  const [[before]] = await conn.query(
    `SELECT id, rfq_request_id, first_viewed_at, view_count FROM rfq_dispatches
     WHERE id = ? AND shop_id = ?
     LIMIT 1 FOR UPDATE`,
    [dispatchId, shopId],
  );
  if (!before) return null;

  const wasFirstWebView = before.first_viewed_at == null;

  await conn.query(
    `UPDATE rfq_dispatches SET
       first_viewed_at = COALESCE(first_viewed_at, NOW(3)),
       web_viewed_at = NOW(3),
       view_count = view_count + 1,
       status = CASE WHEN status IN ('pending','web_notified') THEN 'viewed' ELSE status END,
       updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ? AND shop_id = ?`,
    [dispatchId, shopId],
  );

  return {
    rfq_request_id: before.rfq_request_id,
    wasFirstWebView,
    viewCount: Number(before.view_count || 0) + 1,
  };
}

export async function pickShopIdsForMatching(limit, excludeShopIds = []) {
  const recentMin = rfqDispatchTuning.onlineRecentMinutes;
  const visObj = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s", skipShopGate: true });
  const visSql = visObj.sql;
  const params = [recentMin];
  let excludeClause = "";
  if (excludeShopIds?.length) {
    const ph = excludeShopIds.map(() => "?").join(",");
    excludeClause = ` AND p.shopId NOT IN (${ph})`;
    params.push(...excludeShopIds);
  }
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT
        p.shopId AS sid,
        MAX(s.last_seen_at) AS last_seen_at
     FROM products p
     INNER JOIN shops s ON s.id = p.shopId
     WHERE p.shopId IS NOT NULL
      AND s.public_status = 'public'
      ${visSql}${excludeClause}
     GROUP BY p.shopId
     ORDER BY
       CASE
         WHEN MAX(s.last_seen_at) IS NOT NULL
              AND MAX(s.last_seen_at) > DATE_SUB(NOW(3), INTERVAL ? MINUTE)
         THEN 0 ELSE 1 END,
       CASE WHEN MAX(s.last_seen_at) IS NULL THEN 1 ELSE 0 END,
       MAX(s.last_seen_at) DESC,
       sid ASC
     LIMIT ?`,
    params,
  );
  return rows.map((x) => x.sid);
}
