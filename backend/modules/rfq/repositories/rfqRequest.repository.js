import { pool } from "../../../config/db.js";

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
  let imgs = [];
  try {
    imgs = row.images_json ? JSON.parse(row.images_json) : [];
  } catch {
    imgs = [];
  }
  const next = [...imgs, ...urls];
  await pool.query(
    `UPDATE rfq_requests SET images_json = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [JSON.stringify(next), row.id],
  );
  return row.id;
}
