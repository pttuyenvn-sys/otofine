import { pool } from "../../../config/db.js";

export function attributionWindowHours() {
  return Math.max(1, Number(process.env.RFQ_BUYER_REMINDER_ATTRIBUTION_HOURS || 24));
}

export async function insertReminderSend(row) {
  const [r] = await pool.query(
    `INSERT INTO rfq_reminder_sends (
       rfq_request_id, reminder_type, phone_hash, subscription_ids,
       sent_log_event_type, sent_log_event_key, onesignal_notification_id
     ) VALUES (?,?,?,?,?,?,?)`,
    [
      row.rfq_request_id,
      row.reminder_type,
      row.phone_hash || null,
      row.subscription_ids ? JSON.stringify(row.subscription_ids) : null,
      row.sent_log_event_type,
      row.sent_log_event_key,
      row.onesignal_notification_id || null,
    ],
  );
  return r.insertId;
}

export async function updateReminderSendNotificationId(sendId, notificationId) {
  await pool.query(
    `UPDATE rfq_reminder_sends SET onesignal_notification_id = ? WHERE id = ?`,
    [notificationId || null, sendId],
  );
}

export async function findReminderSendById(sendId) {
  const [[row]] = await pool.query(
    `SELECT * FROM rfq_reminder_sends WHERE id = ? LIMIT 1`,
    [sendId],
  );
  return row || null;
}

export async function findAttributableSendForRfq(rfqRequestId) {
  const rid = Number(rfqRequestId);
  if (!Number.isFinite(rid) || rid <= 0) return null;
  const hours = attributionWindowHours();

  const [[row]] = await pool.query(
    `
    SELECT s.*
    FROM rfq_reminder_sends s
    WHERE s.rfq_request_id = ?
      AND s.sent_at > DATE_SUB(NOW(3), INTERVAL ? HOUR)
      AND NOT EXISTS (
        SELECT 1 FROM rfq_reminder_outcomes o
        WHERE o.send_id = s.id AND o.outcome = 'dismissed'
      )
    ORDER BY s.sent_at DESC
    LIMIT 1
    `,
    [rid, hours],
  );
  return row || null;
}

export async function insertOutcomeIgnoreDuplicate({
  sendId,
  outcome,
  conversionKind = "",
  subscriptionId = null,
  metadata = null,
}) {
  const sid = Number(sendId);
  if (!Number.isFinite(sid) || sid <= 0) return { inserted: false };

  const kind = String(conversionKind || "");
  const [r] = await pool.query(
    `INSERT IGNORE INTO rfq_reminder_outcomes (
       send_id, outcome, conversion_kind, subscription_id, metadata_json
     ) VALUES (?,?,?,?,?)`,
    [
      sid,
      outcome,
      kind,
      subscriptionId || null,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
  return { inserted: (r.affectedRows ?? 0) > 0 };
}

export async function hasOutcome(sendId, outcome, conversionKind = "") {
  const [[row]] = await pool.query(
    `SELECT 1 AS ok FROM rfq_reminder_outcomes
     WHERE send_id = ? AND outcome = ? AND conversion_kind = ?
     LIMIT 1`,
    [sendId, outcome, conversionKind || ""],
  );
  return Boolean(row?.ok);
}

export async function findRecentSendsForSubscription(subscriptionId, hours = 24) {
  const sub = String(subscriptionId || "").trim();
  if (!sub) return [];

  const [rows] = await pool.query(
    `
    SELECT s.*
    FROM rfq_reminder_sends s
    WHERE s.sent_at > DATE_SUB(NOW(3), INTERVAL ? HOUR)
      AND JSON_CONTAINS(s.subscription_ids, JSON_QUOTE(?))
    ORDER BY s.sent_at DESC
    LIMIT 20
    `,
    [hours, sub],
  );
  return rows;
}

export async function aggregateReminderMetrics(days = 7) {
  const d = Math.max(1, Math.min(90, Number(days) || 7));

  const [byType] = await pool.query(
    `
    SELECT
      s.reminder_type,
      COUNT(*) AS sends,
      COUNT(DISTINCT CASE WHEN o_open.send_id IS NOT NULL THEN s.id END) AS opens,
      COUNT(DISTINCT CASE WHEN o_reopen.send_id IS NOT NULL THEN s.id END) AS reopen,
      COUNT(DISTINCT CASE WHEN o_quote.send_id IS NOT NULL THEN s.id END) AS quote_view,
      COUNT(DISTINCT CASE WHEN o_msg.send_id IS NOT NULL THEN s.id END) AS buyer_message,
      COUNT(DISTINCT CASE WHEN o_conv.send_id IS NOT NULL THEN s.id END) AS converted_any,
      COUNT(DISTINCT CASE WHEN o_dismiss.send_id IS NOT NULL THEN s.id END) AS dismissed,
      COUNT(DISTINCT CASE WHEN o_opt.send_id IS NOT NULL THEN s.id END) AS opt_out
    FROM rfq_reminder_sends s
    LEFT JOIN rfq_reminder_outcomes o_open
      ON o_open.send_id = s.id AND o_open.outcome = 'opened'
    LEFT JOIN rfq_reminder_outcomes o_reopen
      ON o_reopen.send_id = s.id AND o_reopen.outcome = 'converted' AND o_reopen.conversion_kind = 'reopen'
    LEFT JOIN rfq_reminder_outcomes o_quote
      ON o_quote.send_id = s.id AND o_quote.outcome = 'converted' AND o_quote.conversion_kind = 'quote_view'
    LEFT JOIN rfq_reminder_outcomes o_msg
      ON o_msg.send_id = s.id AND o_msg.outcome = 'converted' AND o_msg.conversion_kind = 'buyer_message'
    LEFT JOIN rfq_reminder_outcomes o_conv
      ON o_conv.send_id = s.id AND o_conv.outcome = 'converted'
    LEFT JOIN rfq_reminder_outcomes o_dismiss
      ON o_dismiss.send_id = s.id AND o_dismiss.outcome = 'dismissed'
    LEFT JOIN rfq_reminder_outcomes o_opt
      ON o_opt.send_id = s.id AND o_opt.outcome = 'opt_out'
    WHERE s.sent_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
    GROUP BY s.reminder_type
    ORDER BY s.reminder_type
    `,
    [d],
  );

  const [[totals]] = await pool.query(
    `
    SELECT
      COUNT(*) AS sends,
      COUNT(DISTINCT CASE WHEN o_open.send_id IS NOT NULL THEN s.id END) AS opens,
      COUNT(DISTINCT CASE WHEN o_conv.send_id IS NOT NULL THEN s.id END) AS converted_any,
      COUNT(DISTINCT CASE WHEN o_opt.send_id IS NOT NULL THEN s.id END) AS opt_out
    FROM rfq_reminder_sends s
    LEFT JOIN rfq_reminder_outcomes o_open
      ON o_open.send_id = s.id AND o_open.outcome = 'opened'
    LEFT JOIN rfq_reminder_outcomes o_conv
      ON o_conv.send_id = s.id AND o_conv.outcome = 'converted'
    LEFT JOIN rfq_reminder_outcomes o_opt
      ON o_opt.send_id = s.id AND o_opt.outcome = 'opt_out'
    WHERE s.sent_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
    `,
    [d],
  );

  return { days: d, by_type: byType, totals };
}
