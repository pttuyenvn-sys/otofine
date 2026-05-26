import { pool } from "../../../config/db.js";

const SITE_ORIGIN = "https://otofine.com";

/**
 * Build buyer push deep-link landing URL (/rfq/open).
 * Security: publicId alone does not grant access — opener validates viewer/history token.
 */
export function buildBuyerPushDeepLinkUrl({ publicId, dispatchId, attributionId, rfqRequestId }) {
  const pid = String(publicId || "").trim();
  if (!pid) {
    return `${SITE_ORIGIN}/rfq/history`;
  }

  const params = new URLSearchParams();
  params.set("publicId", pid);
  const did = Number(dispatchId);
  if (Number.isFinite(did) && did > 0) params.set("dispatchId", String(did));
  const aid = Number(attributionId);
  if (Number.isFinite(aid) && aid > 0) params.set("attributionId", String(aid));
  const rid = Number(rfqRequestId);
  if (Number.isFinite(rid) && rid > 0) params.set("rfqRequestId", String(rid));

  return `${SITE_ORIGIN}/rfq/open?${params.toString()}`;
}

export function buildBuyerPushDeepLinkData({
  publicId,
  dispatchId,
  attributionId,
  rfqRequestId,
  reminderType,
}) {
  const data = {
    publicId: String(publicId || "").trim() || undefined,
    rfqRequestId: Number(rfqRequestId) > 0 ? Number(rfqRequestId) : undefined,
  };
  const did = Number(dispatchId);
  if (Number.isFinite(did) && did > 0) data.dispatchId = did;
  const aid = Number(attributionId);
  if (Number.isFinite(aid) && aid > 0) data.attributionId = aid;
  if (reminderType) data.reminderType = String(reminderType);
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v != null && v !== ""));
}

export async function loadRfqPublicId(rfqRequestId) {
  const rid = Number(rfqRequestId);
  if (!Number.isFinite(rid) || rid <= 0) return null;
  const [[row]] = await pool.query(
    `SELECT public_id FROM rfq_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [rid],
  );
  return row?.public_id ? String(row.public_id).trim() : null;
}
