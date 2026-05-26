import { pool } from "../../../config/db.js";

const ACTIVE_STATUSES = ["open", "dispatching", "quoted"];
const TERMINAL_STATUSES = ["closed", "cancelled", "expired", "pending_otp"];

function batchLimit() {
  return Math.max(10, Math.min(200, Number(process.env.RFQ_BUYER_REMINDER_BATCH || 50)));
}

/**
 * RFQs with push opt-in, no buyer chat messages, age > minHours.
 */
export async function listInactiveAfterCreationCandidates(minHours = 6) {
  const [rows] = await pool.query(
    `
    SELECT DISTINCT r.id AS rfq_request_id, r.public_id, r.vehicle_json, r.created_at
    FROM rfq_requests r
    INNER JOIN rfq_push_subscriptions ps
      ON ps.rfq_request_id = r.id AND ps.pref_reminders = 1
    WHERE r.deleted_at IS NULL
      AND r.spam_flag = 0
      AND r.status IN (?)
      AND r.created_at < DATE_SUB(NOW(3), INTERVAL ? HOUR)
      AND (r.expires_at IS NULL OR r.expires_at > NOW(3))
      AND NOT EXISTS (
        SELECT 1
        FROM rfq_conversations c
        JOIN rfq_messages m
          ON m.conversation_id = c.id
         AND m.deleted_at IS NULL
         AND m.sender_type = 'buyer'
        WHERE c.rfq_request_id = r.id
      )
    ORDER BY r.created_at ASC
    LIMIT ?
    `,
    [ACTIVE_STATUSES, minHours, batchLimit()],
  );
  return rows;
}

/**
 * RFQs with quotes older than minHours that buyer has not surfaced since latest quote.
 */
export async function listUnseenQuoteCandidates(minHours = 1) {
  const [rows] = await pool.query(
    `
    SELECT r.id AS rfq_request_id, r.public_id, r.vehicle_json,
           MAX(q.created_at) AS latest_quote_at,
           COUNT(q.id) AS quote_count
    FROM rfq_requests r
    INNER JOIN rfq_push_subscriptions ps
      ON ps.rfq_request_id = r.id AND ps.pref_reminders = 1
    INNER JOIN rfq_quotes q
      ON q.rfq_request_id = r.id AND q.deleted_at IS NULL
    WHERE r.deleted_at IS NULL
      AND r.spam_flag = 0
      AND r.status IN ('dispatching', 'quoted')
      AND (r.expires_at IS NULL OR r.expires_at > NOW(3))
    GROUP BY r.id, r.public_id, r.vehicle_json
    HAVING MAX(q.created_at) < DATE_SUB(NOW(3), INTERVAL ? HOUR)
       AND MAX(q.created_at) > COALESCE((
         SELECT MAX(e.created_at)
         FROM rfq_customer_events e
         WHERE e.rfq_request_id = r.id
           AND e.event_type = 'customer_quotes_surface_view'
       ), '1970-01-01')
    ORDER BY latest_quote_at ASC
    LIMIT ?
    `,
    [minHours, batchLimit()],
  );
  return rows;
}

/**
 * RFQs with unread shop messages and buyer inactive longer than minMinutes.
 */
export async function listUnreadMessageCandidates(minMinutes = 30) {
  const [rows] = await pool.query(
    `
    SELECT r.id AS rfq_request_id, r.public_id, r.vehicle_json,
           uc.unread_count,
           GREATEST(
             COALESCE(bm.last_buyer_msg_at, r.created_at),
             COALESCE(br.last_buyer_read_at, r.created_at),
             COALESCE(ce.last_buyer_event_at, r.created_at)
           ) AS last_buyer_activity_at
    FROM rfq_requests r
    INNER JOIN (
      SELECT DISTINCT rfq_request_id
      FROM rfq_push_subscriptions
      WHERE pref_reminders = 1
    ) sub ON sub.rfq_request_id = r.id
    INNER JOIN (
      SELECT conv.rfq_request_id, COUNT(m.id) AS unread_count
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
      GROUP BY conv.rfq_request_id
      HAVING unread_count > 0
    ) uc ON uc.rfq_request_id = r.id
    LEFT JOIN (
      SELECT c.rfq_request_id, MAX(m.created_at) AS last_buyer_msg_at
      FROM rfq_conversations c
      JOIN rfq_messages m
        ON m.conversation_id = c.id
       AND m.deleted_at IS NULL
       AND m.sender_type = 'buyer'
      GROUP BY c.rfq_request_id
    ) bm ON bm.rfq_request_id = r.id
    LEFT JOIN (
      SELECT c.rfq_request_id, MAX(cr.last_read_at) AS last_buyer_read_at
      FROM rfq_conversations c
      JOIN rfq_conversation_reads cr
        ON cr.conversation_id = c.id
       AND cr.participant_type = 'buyer'
       AND cr.participant_shop_id = 0
      GROUP BY c.rfq_request_id
    ) br ON br.rfq_request_id = r.id
    LEFT JOIN (
      SELECT e.rfq_request_id, MAX(e.created_at) AS last_buyer_event_at
      FROM rfq_customer_events e
      WHERE e.event_type IN ('customer_token_open', 'customer_quotes_surface_view')
      GROUP BY e.rfq_request_id
    ) ce ON ce.rfq_request_id = r.id
    WHERE r.deleted_at IS NULL
      AND r.spam_flag = 0
      AND r.status NOT IN (?)
      AND (r.expires_at IS NULL OR r.expires_at > NOW(3))
      AND GREATEST(
        COALESCE(bm.last_buyer_msg_at, r.created_at),
        COALESCE(br.last_buyer_read_at, r.created_at),
        COALESCE(ce.last_buyer_event_at, r.created_at)
      ) < DATE_SUB(NOW(3), INTERVAL ? MINUTE)
    ORDER BY last_buyer_activity_at ASC
    LIMIT ?
    `,
    [TERMINAL_STATUSES, minMinutes, batchLimit()],
  );
  return rows;
}

export async function wasReminderSentWithinHours(rfqRequestId, eventType, hours = 24) {
  const rid = Number(rfqRequestId);
  if (!Number.isFinite(rid) || rid <= 0) return false;
  const [[row]] = await pool.query(
    `SELECT 1 AS ok FROM rfq_push_sent_log
     WHERE rfq_request_id = ? AND event_type = ?
       AND sent_at > DATE_SUB(NOW(3), INTERVAL ? HOUR)
     LIMIT 1`,
    [rid, eventType, hours],
  );
  return Boolean(row?.ok);
}
