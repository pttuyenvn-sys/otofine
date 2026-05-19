import { pool } from "../../../config/db.js";
import { rfqDispatchTuning } from "../../../config/rfq.config.js";

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
  const sort = String(opts.sort || "sla").toLowerCase();

  const where = [`d.shop_id = ?`, `r.deleted_at IS NULL`, `COALESCE(r.spam_flag, 0) = 0`];
  const params = [shopId];

  if (filter === "unread") {
    where.push(`d.first_viewed_at IS NULL`);
  } else if (filter === "quoted") {
    where.push(
      `(d.status = 'quoted' OR EXISTS (
         SELECT 1 FROM rfq_quotes q
         WHERE q.dispatch_id = d.id AND q.deleted_at IS NULL AND q.status = 'submitted'
       ))`,
    );
  } else if (filter === "expired") {
    where.push(`(
       d.status = 'expired'
       OR d.status = 'failed'
       OR (d.respond_by IS NOT NULL AND d.respond_by < NOW(3))
       OR (r.expires_at IS NOT NULL AND r.expires_at < NOW(3))
       OR r.status IN ('expired','cancelled','closed')
     )`);
  }

  let orderBy;
  if (sort === "recent") {
    orderBy = `d.web_notified_at DESC, d.id DESC`;
  } else {
    orderBy = `CASE WHEN d.first_viewed_at IS NULL THEN 0 ELSE 1 END ASC,
      (d.respond_by IS NULL) ASC,
      d.respond_by ASC,
      d.web_notified_at DESC`;
  }

  const sql = `
    SELECT d.*, r.public_id, r.part_description, r.status AS rfq_status, r.vehicle_json,
           r.created_at AS rfq_created_at, r.expires_at AS rfq_expires_at
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
       AND d.status NOT IN ('expired','failed','skipped')
       AND (r.expires_at IS NULL OR r.expires_at > NOW(3))
       AND r.status NOT IN ('expired','cancelled','closed')
       AND COALESCE(r.spam_flag, 0) = 0`,
    [shopId],
  );
  return Number(row?.c || 0);
}

export async function findDispatchForShop(dispatchId, shopId) {
  const [[row]] = await pool.query(
    `SELECT d.*, r.public_id, r.part_description, r.status AS rfq_status, r.vehicle_json,
            r.images_json, r.created_at AS rfq_created_at, r.expires_at AS rfq_expires_at
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
     WHERE p.shopId IS NOT NULL${excludeClause}
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
