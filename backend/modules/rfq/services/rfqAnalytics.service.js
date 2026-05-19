import { pool } from "../../../config/db.js";

function pct(n, d) {
  if (!d || d <= 0) return null;
  return Math.round((10000 * n) / d) / 100;
}

function dropPct(prev, next) {
  if (!prev || prev <= 0 || next == null) return null;
  return Math.round((10000 * (prev - next)) / prev) / 100;
}

/**
 * RFQ funnel — cohort = RFQs created in window (non-spam).
 * Stages: created → dispatch → seller web view → quote → customer saw quotes → quoted/closed (accept proxy).
 */
export async function getRfqFunnelAnalytics(days = 7) {
  const d = Math.max(1, Math.min(90, Number(days) || 7));

  const [[{ cohort }]] = await pool.query(
    `SELECT COUNT(*) AS cohort FROM rfq_requests r
     WHERE r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [d],
  );
  const n0 = Number(cohort || 0);

  const [[{ n_dispatch }]] = await pool.query(
    `SELECT COUNT(DISTINCT r.id) AS n_dispatch
     FROM rfq_requests r
     INNER JOIN rfq_dispatches d ON d.rfq_request_id = r.id
     WHERE r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [d],
  );

  const [[{ n_seller_view }]] = await pool.query(
    `SELECT COUNT(DISTINCT r.id) AS n_seller_view
     FROM rfq_requests r
     INNER JOIN rfq_dispatches d ON d.rfq_request_id = r.id
     WHERE r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
       AND d.first_viewed_at IS NOT NULL`,
    [d],
  );

  const [[{ n_quote }]] = await pool.query(
    `SELECT COUNT(DISTINCT r.id) AS n_quote
     FROM rfq_requests r
     WHERE r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
       AND EXISTS (
         SELECT 1 FROM rfq_quotes q
         WHERE q.rfq_request_id = r.id AND q.deleted_at IS NULL AND q.status = 'submitted'
       )`,
    [d],
  );

  const [[{ n_customer_quote_surface }]] = await pool.query(
    `SELECT COUNT(DISTINCT e.rfq_request_id) AS n_customer_quote_surface
     FROM rfq_customer_events e
     INNER JOIN rfq_requests r ON r.id = e.rfq_request_id AND r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
     WHERE r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
       AND e.event_type = 'customer_quotes_surface_view'`,
    [d],
  );

  const [[{ n_terminal }]] = await pool.query(
    `SELECT COUNT(*) AS n_terminal
     FROM rfq_requests r
     WHERE r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
       AND r.status IN ('quoted','closed')`,
    [d],
  );

  const [[lat]] = await pool.query(
    `SELECT
       AVG(TIMESTAMPDIFF(SECOND, r.created_at, dd.first_dispatch_at)) AS sec_rfq_to_first_dispatch,
       AVG(TIMESTAMPDIFF(SECOND, r.created_at, d.first_viewed_at)) AS sec_rfq_to_first_seller_view,
       AVG(TIMESTAMPDIFF(SECOND, r.created_at, q.first_quote)) AS sec_rfq_to_first_quote
     FROM rfq_requests r
     LEFT JOIN (
       SELECT rfq_request_id, MIN(created_at) AS first_dispatch_at
       FROM rfq_dispatches GROUP BY rfq_request_id
     ) dd ON dd.rfq_request_id = r.id
     LEFT JOIN (
       SELECT rfq_request_id, MIN(first_viewed_at) AS first_viewed_at
       FROM rfq_dispatches GROUP BY rfq_request_id
     ) d ON d.rfq_request_id = r.id
     LEFT JOIN (
       SELECT rfq_request_id, MIN(submitted_at) AS first_quote
       FROM rfq_quotes WHERE deleted_at IS NULL AND status = 'submitted' GROUP BY rfq_request_id
     ) q ON q.rfq_request_id = r.id
     WHERE r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [d],
  );

  const [[sla]] = await pool.query(
    `SELECT
       SUM(CASE WHEN q.submitted_at > d.respond_by THEN 1 ELSE 0 END) AS late_cnt,
       COUNT(*) AS total_q
     FROM rfq_quotes q
     INNER JOIN rfq_dispatches d ON d.id = q.dispatch_id
     INNER JOIN rfq_requests r ON r.id = q.rfq_request_id
     WHERE q.deleted_at IS NULL AND q.status = 'submitted'
       AND d.respond_by IS NOT NULL
       AND r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [d],
  );

  const n1 = Number(n_dispatch || 0);
  const n2 = Number(n_seller_view || 0);
  const n3 = Number(n_quote || 0);
  const n4 = Number(n_customer_quote_surface || 0);
  const n5 = Number(n_terminal || 0);

  const stages = {
    rfq_created: { count: n0, conversion_from_previous_pct: null, drop_off_from_previous_pct: null },
    dispatch_created: {
      count: n1,
      conversion_from_previous_pct: pct(n1, n0),
      drop_off_from_previous_pct: dropPct(n0, n1),
    },
    seller_web_viewed: {
      count: n2,
      conversion_from_previous_pct: pct(n2, n1),
      drop_off_from_previous_pct: dropPct(n1, n2),
    },
    quote_submitted: {
      count: n3,
      conversion_from_previous_pct: pct(n3, n2),
      drop_off_from_previous_pct: dropPct(n2, n3),
    },
    user_viewed_quotes: {
      count: n4,
      conversion_from_previous_pct: pct(n4, n3),
      drop_off_from_previous_pct: dropPct(n3, n4),
    },
    accepted_or_closed_proxy: {
      count: n5,
      conversion_from_previous_pct: pct(n5, n4),
      drop_off_from_previous_pct: dropPct(n4, n5),
    },
  };

  const late = Number(sla?.late_cnt || 0);
  const totalQ = Number(sla?.total_q || 0);

  return {
    window_days: d,
    stages,
    latency_seconds_avg: {
      rfq_to_first_dispatch: lat?.sec_rfq_to_first_dispatch != null ? Number(lat.sec_rfq_to_first_dispatch) : null,
      rfq_to_first_seller_view: lat?.sec_rfq_to_first_seller_view != null ? Number(lat.sec_rfq_to_first_seller_view) : null,
      rfq_to_first_quote: lat?.sec_rfq_to_first_quote != null ? Number(lat.sec_rfq_to_first_quote) : null,
    },
    seller_response_quality: {
      quotes_submitted_vs_respond_by: {
        submitted_total: totalQ,
        submitted_after_deadline: late,
        on_time_pct: pct(totalQ - late, totalQ),
      },
      note:
        "customer_quotes_surface_view emitted when buyer opens token link while quotes exist; tune copy/notifications using funnel + UX metrics.",
    },
  };
}

/** Per-shop rollup — matching/dispatch tuning & inactive sellers */
export async function getSellerPerformanceAnalytics(days = 30, limit = 40) {
  const d = Math.max(1, Math.min(120, Number(days) || 30));
  const lim = Math.max(1, Math.min(200, Number(limit) || 40));

  const [rows] = await pool.query(
    `SELECT
       d.shop_id,
       COUNT(*) AS dispatches,
       SUM(CASE WHEN d.first_viewed_at IS NOT NULL THEN 1 ELSE 0 END) AS viewed_cnt,
       SUM(CASE WHEN q.first_q IS NOT NULL THEN 1 ELSE 0 END) AS dispatch_with_quote_cnt,
       SUM(CASE WHEN d.first_viewed_at IS NOT NULL AND q.first_q IS NULL THEN 1 ELSE 0 END) AS viewed_no_quote_cnt,
       SUM(CASE WHEN d.zalo_notified_at IS NOT NULL THEN 1 ELSE 0 END) AS zalo_cnt,
       AVG(TIMESTAMPDIFF(SECOND, d.web_notified_at, d.first_viewed_at)) AS avg_sec_to_first_view,
       AVG(TIMESTAMPDIFF(SECOND, d.web_notified_at, q.first_q)) AS avg_sec_to_quote,
       MAX(s.last_seen_at) AS shop_last_seen_at
     FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id AND r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
     INNER JOIN shops s ON s.id = d.shop_id
     LEFT JOIN (
       SELECT dispatch_id, MIN(submitted_at) AS first_q
       FROM rfq_quotes WHERE deleted_at IS NULL AND status = 'submitted'
       GROUP BY dispatch_id
     ) q ON q.dispatch_id = d.id
     WHERE d.web_notified_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
     GROUP BY d.shop_id
     ORDER BY dispatches DESC
     LIMIT ?`,
    [d, lim],
  );

  return rows.map((row) => {
    const disp = Number(row.dispatches || 0);
    const viewed = Number(row.viewed_cnt || 0);
    const withQuote = Number(row.dispatch_with_quote_cnt || 0);
    const viewedNoQuote = Number(row.viewed_no_quote_cnt || 0);
    const zalo = Number(row.zalo_cnt || 0);
    return {
      shop_id: row.shop_id,
      dispatches: disp,
      quote_rate_pct: pct(withQuote, disp),
      viewed_no_quote_rate_pct: pct(viewedNoQuote, Math.max(viewed, 1)),
      escalation_dependency_rate_pct: pct(zalo, disp),
      avg_first_view_sec: row.avg_sec_to_first_view != null ? Number(row.avg_sec_to_first_view) : null,
      avg_quote_sec: row.avg_sec_to_quote != null ? Number(row.avg_sec_to_quote) : null,
      rfq_success_rate_proxy_pct: pct(withQuote, disp),
      shop_last_seen_at: row.shop_last_seen_at,
    };
  });
}

/** Seller-side “notification seen” proxy — web inbox notified → opened within 24h */
export async function getSellerNotificationAckRate(days = 7) {
  const d = Math.max(1, Math.min(90, Number(days) || 7));

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id AND r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
     WHERE d.web_notified_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [d],
  );

  const [[{ ack }]] = await pool.query(
    `SELECT COUNT(*) AS ack FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id AND r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
     WHERE d.web_notified_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
       AND d.first_viewed_at IS NOT NULL
       AND d.first_viewed_at <= DATE_ADD(d.web_notified_at, INTERVAL 24 HOUR)`,
    [d],
  );

  const t = Number(total || 0);
  const a = Number(ack || 0);
  return {
    window_days: d,
    notified_dispatches: t,
    viewed_within_24h: a,
    seller_inbox_open_proxy_pct: pct(a, t),
  };
}

/** Buyer UX / return — relies on rfq_customer_events + customer_profile_id */
export async function getRfqUxAnalytics(days = 7) {
  const d = Math.max(1, Math.min(90, Number(days) || 7));

  const [[{ cohort_n }]] = await pool.query(
    `SELECT COUNT(*) AS cohort_n FROM rfq_requests r
     WHERE r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [d],
  );
  const cohortDenominator = Number(cohort_n || 0);

  const [[{ profiles }]] = await pool.query(
    `SELECT COUNT(DISTINCT customer_profile_id) AS profiles
     FROM rfq_requests r
     WHERE r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       AND r.customer_profile_id IS NOT NULL
       AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [d],
  );

  const [[{ returning_profiles }]] = await pool.query(
    `SELECT COUNT(*) AS returning_profiles FROM (
       SELECT customer_profile_id
       FROM rfq_requests r
       WHERE r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
         AND r.customer_profile_id IS NOT NULL
         AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
       GROUP BY customer_profile_id
       HAVING COUNT(*) >= 2
     ) x`,
    [d],
  );

  const [[{ reopen }]] = await pool.query(
    `SELECT COUNT(*) AS reopen FROM (
       SELECT e.rfq_request_id
       FROM rfq_customer_events e
       INNER JOIN rfq_requests r ON r.id = e.rfq_request_id AND r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       WHERE r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
         AND e.event_type IN ('customer_token_open','customer_quotes_surface_view')
       GROUP BY e.rfq_request_id
       HAVING COUNT(*) >= 2
     ) y`,
    [d],
  );

  const [[{ with_quotes }]] = await pool.query(
    `SELECT COUNT(*) AS with_quotes
     FROM rfq_requests r
     WHERE r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
       AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
       AND EXISTS (
         SELECT 1 FROM rfq_quotes q
         WHERE q.rfq_request_id = r.id AND q.deleted_at IS NULL AND q.status = 'submitted'
       )`,
    [d],
  );

  const [[{ saw_quotes_surface }]] = await pool.query(
    `SELECT COUNT(DISTINCT e.rfq_request_id) AS saw_quotes_surface
     FROM rfq_customer_events e
     INNER JOIN rfq_requests r ON r.id = e.rfq_request_id AND r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
     WHERE r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
       AND e.event_type = 'customer_quotes_surface_view'`,
    [d],
  );

  const prof = Number(profiles || 0);
  const ret = Number(returning_profiles || 0);
  const wq = Number(with_quotes || 0);
  const sq = Number(saw_quotes_surface || 0);
  const reopenN = Number(reopen?.reopen || 0);

  const sellerAck = await getSellerNotificationAckRate(d);

  return {
    window_days: d,
    user_return_rate_pct: pct(ret, prof),
    rfq_revisit_rate_pct: pct(reopenN, cohortDenominator),
    quote_surface_when_quotes_exist_pct: pct(sq, wq),
    buyer_notification_ctr_note:
      "Chưa có bảng click URL SMS/Zalo cho khách — bổ sung payload_json deeplink_id + webhook hoặc redirect logging khi scale.",
    seller_notification_ack_proxy: sellerAck,
  };
}
