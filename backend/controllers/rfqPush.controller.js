import { pool } from "../config/db.js";

/**
 * Anonymous buyer: register OneSignal subscription for an RFQ (no JWT).
 * Body: { rfqRequestId, playerId } — không dùng viewer_link_token trong flow (cột DB giữ không xóa).
 */
export async function registerBuyerPushSubscription(req, res) {
  try {
    const {
      rfqRequestId,
      playerId,
      viewerPath,
    } = req.body || {};

    const rid = Number(rfqRequestId);
    if (!Number.isFinite(rid) || rid <= 0) {
      return res.status(400).json({
        ok: false,
        message: "rfqRequestId required",
      });
    }

    const sub =
      playerId !== undefined && playerId !== null ? String(playerId).trim() : "";
    if (!sub) {
      return res.status(400).json({
        ok: false,
        message: "playerId required",
      });
    }

    const [[row]] = await pool.query(
      `SELECT id FROM rfq_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [rid],
    );
    if (!row) {
      return res.status(404).json({
        ok: false,
        message: "RFQ not found",
      });
    }

    await pool.query(
      `
      INSERT INTO rfq_push_subscriptions (
        rfq_request_id,
        onesignal_subscription_id,
        viewer_path
      )
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        viewer_path = VALUES(viewer_path)
      `,
      [
        rid,
        sub,
        viewerPath || null,
      ],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("[rfq-push] registerBuyerPushSubscription:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
