import { pool } from "../../../config/db.js";

import { rfqTouchDebounceMinutes } from "../../../config/rfq.config.js";

/**
 * Debounced touch — encourages accurate online_recently without hot-row churn.
 */
export async function rfqTouchShopSeen(req, res, next) {
  const shopId = req.shop?.id;
  if (!shopId) return next();
  const mins = rfqTouchDebounceMinutes;
  try {
    await pool.query(
      `UPDATE shops SET last_seen_at = NOW(3)
       WHERE id = ?
         AND (
           last_seen_at IS NULL
           OR TIMESTAMPDIFF(MINUTE, last_seen_at, NOW(3)) >= ?
         )`,
      [shopId, mins],
    );
  } catch (e) {
    console.warn("[RFQ] touch shop seen skipped:", e.message);
  }
  next();
}
