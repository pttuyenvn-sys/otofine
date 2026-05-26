import { pool } from "../../../config/db.js";
import { mergeRfqImageUrlLists } from "../utils/rfqImageUrls.js";

export async function insertRequest(conn, row) {
  const c = conn || pool;
  const [r] = await c.query(
    `INSERT INTO rfq_requests (
       public_id, status, guest_phone_e164, guest_phone_hash,
       dedupe_fingerprint,
       otp_code_hash, otp_expires_at, vehicle_json, part_description,
       category_key, location_json, images_json, expires_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      row.public_id,
      row.status,
      row.guest_phone_e164,
      row.guest_phone_hash,
      row.dedupe_fingerprint ?? null,
      row.otp_code_hash,
      row.otp_expires_at,
      row.vehicle_json ? JSON.stringify(row.vehicle_json) : null,
      row.part_description,
      row.category_key ?? null,
      row.location_json ? JSON.stringify(row.location_json) : null,
      row.images_json ? JSON.stringify(row.images_json) : null,
      row.expires_at ?? null,
    ],
  );
  return r.insertId;
}

/** Active lifecycle rows only — excludes closed/expired/cancelled */
export async function lockRecentByFingerprint(conn, fingerprint, windowHours) {
  const [[row]] = await conn.query(
    `SELECT * FROM rfq_requests
     WHERE dedupe_fingerprint = ?
       AND deleted_at IS NULL
       AND status NOT IN ('closed','expired','cancelled')
       AND created_at >= DATE_SUB(NOW(3), INTERVAL ? HOUR)
       AND (expires_at IS NULL OR expires_at > NOW(3))
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`,
    [fingerprint, windowHours],
  );
  return row || null;
}

export async function mergePendingOtp(conn, id, patch) {
  const c = conn || pool;
  await c.query(
    `UPDATE rfq_requests SET
       part_description = CONCAT(IFNULL(part_description,''), '\n--- merged ---\n', ?),
       vehicle_json = COALESCE(?, vehicle_json),
       images_json = ?,
       otp_code_hash = ?, otp_expires_at = ?, otp_attempts = 0,
       category_key = COALESCE(?, category_key),
       location_json = COALESCE(?, location_json),
       updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ? AND status = 'pending_otp'`,
    [
      patch.part_description_append,
      patch.vehicle_json ? JSON.stringify(patch.vehicle_json) : null,
      JSON.stringify(patch.images_json ?? []),
      patch.otp_code_hash,
      patch.otp_expires_at,
      patch.category_key ?? null,
      patch.location_json ? JSON.stringify(patch.location_json) : null,
      id,
    ],
  );
}

export async function findByPublicId(publicId) {
  const [[row]] = await pool.query(
    `SELECT * FROM rfq_requests WHERE public_id = ? AND deleted_at IS NULL LIMIT 1`,
    [publicId],
  );
  return row || null;
}

export async function findByViewerTokenHash(hash) {
  const [[row]] = await pool.query(
    `SELECT * FROM rfq_requests WHERE viewer_token_hash = ? AND deleted_at IS NULL LIMIT 1`,
    [hash],
  );
  return row || null;
}

export async function findById(id) {
  const [[row]] = await pool.query(
    `SELECT * FROM rfq_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id],
  );
  return row || null;
}

export async function updateOtp(conn, id, { otpHash, expiresAt }) {
  const c = conn || pool;
  await c.query(
    `UPDATE rfq_requests SET otp_code_hash = ?, otp_expires_at = ?, otp_attempts = 0,
      updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [otpHash, expiresAt, id],
  );
}

export async function bumpOtpAttempt(conn, id) {
  const c = conn || pool;
  await c.query(
    `UPDATE rfq_requests SET otp_attempts = otp_attempts + 1, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [id],
  );
}

export async function verifyAndOpen(
  conn,
  id,
  { viewerTokenHash, customerProfileId }
) {
  const c = conn || pool;

  await c.query(
    `UPDATE rfq_requests SET
       status = 'open',
       viewer_token_hash = ?,
       customer_profile_id = ?,
       verified_at = NOW(3),
       otp_code_hash = NULL,
       otp_expires_at = NULL,
       updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [viewerTokenHash, customerProfileId, id],
  );

  // Shop OneSignal deep-links must use dispatchId: /rfq/shop/:dispatchId
  // (canonical shop conversation anchor). rfq_request_id must never be used
  // for shop detail routing. No push here — dispatch rows do not exist yet;
  // per-shop pushes run in rfqDispatch.service after runDispatchForOpenRequest.
}

export async function setStatus(conn, id, status, extra = {}) {
  const c = conn || pool;
  await c.query(
    `UPDATE rfq_requests SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [status, id],
  );
}

export async function appendImages(publicId, urls) {
  const row = await findByPublicId(publicId);
  if (!row) return null;
  const next = mergeRfqImageUrlLists(row.images_json, urls);
  await pool.query(
    `UPDATE rfq_requests SET images_json = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [JSON.stringify(next), row.id],
  );
  return row.id;
}

/** Idempotent — marks first shop engagement on the RFQ request. */
export async function markFirstShopMessageAt(conn, rfqRequestId) {
  await conn.query(
    `UPDATE rfq_requests
     SET first_shop_message_at = COALESCE(first_shop_message_at, NOW(3))
     WHERE id = ?`,
    [rfqRequestId],
  );
}

export async function findByPublicIdAndPhoneHash(publicId, phoneHash) {
  const [[row]] = await pool.query(
    `SELECT * FROM rfq_requests
     WHERE public_id = ? AND guest_phone_hash = ? AND deleted_at IS NULL
     LIMIT 1`,
    [publicId, phoneHash],
  );
  return row || null;
}

export async function rotateViewerTokenHash(conn, id, viewerTokenHash) {
  const c = conn || pool;
  await c.query(
    `UPDATE rfq_requests SET viewer_token_hash = ?, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ? AND deleted_at IS NULL AND status != 'pending_otp'`,
    [viewerTokenHash, id],
  );
}

/**
 * Buyer history list — verified RFQs for phone, latest activity first.
 */
export async function listBuyerHistoryByPhoneHash(phoneHash, { limit = 50 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [rows] = await pool.query(
    `SELECT
       r.id,
       r.public_id,
       r.status,
       r.vehicle_json,
       r.part_description,
       r.images_json,
       r.created_at,
       r.updated_at,
       r.first_shop_message_at,
       r.expires_at,
       COALESCE(dc.shop_count, 0) AS shop_count,
       COALESCE(qc.quote_count, 0) AS quote_count,
       lm.latest_message_at
     FROM rfq_requests r
     LEFT JOIN (
       SELECT rfq_request_id, COUNT(*) AS shop_count
       FROM rfq_dispatches
       GROUP BY rfq_request_id
     ) dc ON dc.rfq_request_id = r.id
     LEFT JOIN (
       SELECT rfq_request_id, COUNT(*) AS quote_count
       FROM rfq_quotes
       GROUP BY rfq_request_id
     ) qc ON qc.rfq_request_id = r.id
     LEFT JOIN (
       SELECT c.rfq_request_id, MAX(m.created_at) AS latest_message_at
       FROM rfq_conversations c
       JOIN rfq_messages m ON m.conversation_id = c.id AND m.deleted_at IS NULL
       GROUP BY c.rfq_request_id
     ) lm ON lm.rfq_request_id = r.id
     WHERE r.guest_phone_hash = ?
       AND r.deleted_at IS NULL
       AND r.status != 'pending_otp'
     ORDER BY COALESCE(lm.latest_message_at, r.updated_at, r.created_at) DESC
     LIMIT ?`,
    [phoneHash, cap],
  );
  return rows;
}

export async function countUnreadForBuyerRequest(rfqRequestId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(m.id) AS unread_count
     FROM rfq_conversations conv
     LEFT JOIN rfq_conversation_reads cr
       ON cr.conversation_id = conv.id
      AND cr.participant_type = 'buyer'
      AND cr.participant_shop_id = 0
     JOIN rfq_messages m
       ON m.conversation_id = conv.id
      AND m.deleted_at IS NULL
      AND m.sender_type = 'shop'
      AND (cr.last_read_message_id IS NULL OR m.id > cr.last_read_message_id)
     WHERE conv.rfq_request_id = ?`,
    [rfqRequestId],
  );
  return Number(row?.unread_count || 0);
}

export async function latestMessagesForRequestIds(requestIds) {
  const ids = requestIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return new Map();

  const [rows] = await pool.query(
    `SELECT c.rfq_request_id, m.message_text, m.sender_type, m.created_at, m.message_type
     FROM rfq_messages m
     JOIN rfq_conversations c ON c.id = m.conversation_id
     JOIN (
       SELECT c2.rfq_request_id, MAX(m2.id) AS max_msg_id
       FROM rfq_messages m2
       JOIN rfq_conversations c2 ON c2.id = m2.conversation_id
       WHERE m2.deleted_at IS NULL AND c2.rfq_request_id IN (?)
       GROUP BY c2.rfq_request_id
     ) pick ON pick.rfq_request_id = c.rfq_request_id AND pick.max_msg_id = m.id
     WHERE m.deleted_at IS NULL`,
    [ids],
  );

  const map = new Map();
  for (const r of rows) {
    map.set(Number(r.rfq_request_id), r);
  }
  return map;
}

export async function countUnreadByRequestIds(requestIds) {
  const ids = requestIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return new Map();

  const [rows] = await pool.query(
    `SELECT conv.rfq_request_id, COUNT(m.id) AS unread_count
     FROM rfq_conversations conv
     LEFT JOIN rfq_conversation_reads cr
       ON cr.conversation_id = conv.id
      AND cr.participant_type = 'buyer'
      AND cr.participant_shop_id = 0
     JOIN rfq_messages m
       ON m.conversation_id = conv.id
      AND m.deleted_at IS NULL
      AND m.sender_type = 'shop'
      AND (cr.last_read_message_id IS NULL OR m.id > cr.last_read_message_id)
     WHERE conv.rfq_request_id IN (?)
     GROUP BY conv.rfq_request_id`,
    [ids],
  );

  const map = new Map();
  for (const r of rows) {
    map.set(Number(r.rfq_request_id), Number(r.unread_count || 0));
  }
  return map;
}

export async function countBuyerHistoryByPhoneHash(phoneHash) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM rfq_requests
     WHERE guest_phone_hash = ? AND deleted_at IS NULL AND status != 'pending_otp'`,
    [phoneHash],
  );
  return Number(row?.total || 0);
}
