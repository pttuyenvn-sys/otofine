import { pool } from "../../../config/db.js";
import * as jobRepo from "../repositories/rfqEscalationJob.repository.js";

/** Operational snapshots for `/api/admin/rfq/health` — read-heavy, cache acceptable per request */
export async function getRfqAdminHealthSnapshot() {
  const jobsByStatus = await jobRepo.countJobsByStatus();

  const [[recentJobs]] = await pool.query(`SELECT COUNT(*) AS c FROM rfq_escalation_jobs WHERE created_at > DATE_SUB(NOW(3), INTERVAL 24 HOUR)`);

  const [[dispatch24]] = await pool.query(
    `SELECT COUNT(*) AS c FROM rfq_dispatches WHERE web_notified_at > DATE_SUB(NOW(3), INTERVAL 24 HOUR)`,
  );

  const [[viewed24]] = await pool.query(
    `SELECT COUNT(*) AS c FROM rfq_dispatches
     WHERE web_notified_at > DATE_SUB(NOW(3), INTERVAL 24 HOUR)
       AND first_viewed_at IS NOT NULL`,
  );

  const [[quoted24]] = await pool.query(
    `SELECT COUNT(*) AS c FROM rfq_dispatches
     WHERE web_notified_at > DATE_SUB(NOW(3), INTERVAL 24 HOUR)
       AND status = 'quoted'`,
  );

  const [[zalo24]] = await pool.query(
    `SELECT COUNT(*) AS c FROM rfq_dispatches
     WHERE web_notified_at > DATE_SUB(NOW(3), INTERVAL 24 HOUR)
       AND zalo_notified_at IS NOT NULL`,
  );

  const [[staleOpen]] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id AND r.deleted_at IS NULL
     WHERE d.respond_by IS NOT NULL
       AND d.respond_by < NOW(3)
       AND d.status NOT IN ('quoted','accepted','expired','failed','skipped')
       AND r.status NOT IN ('expired','cancelled','closed')
       AND (r.expires_at IS NULL OR r.expires_at > NOW(3))`,
  );

  const [[viewNoQuote]] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id AND r.deleted_at IS NULL
     WHERE d.first_viewed_at IS NOT NULL
       AND d.status NOT IN ('quoted','accepted','expired','failed','skipped')
       AND NOT EXISTS (
         SELECT 1 FROM rfq_quotes q
         WHERE q.dispatch_id = d.id AND q.deleted_at IS NULL AND q.status = 'submitted'
       )
       AND (r.expires_at IS NULL OR r.expires_at > NOW(3))
       AND r.status NOT IN ('expired','cancelled','closed')`,
  );

  const [[avgViewSec]] = await pool.query(
    `SELECT AVG(TIMESTAMPDIFF(SECOND, d.web_notified_at, d.first_viewed_at)) AS sec
     FROM rfq_dispatches d
     WHERE d.web_notified_at IS NOT NULL
       AND d.first_viewed_at IS NOT NULL
       AND d.web_notified_at > DATE_SUB(NOW(3), INTERVAL 7 DAY)`,
  );

  const [[avgQuoteSec]] = await pool.query(
    `SELECT AVG(TIMESTAMPDIFF(SECOND, d.web_notified_at, q.submitted_at)) AS sec
     FROM rfq_quotes q
     INNER JOIN rfq_dispatches d ON d.id = q.dispatch_id
     WHERE q.deleted_at IS NULL
       AND q.status = 'submitted'
       AND d.web_notified_at IS NOT NULL
       AND q.submitted_at > DATE_SUB(NOW(3), INTERVAL 7 DAY)`,
  );

  const disp = Number(dispatch24?.c || 0);
  const viewed = Number(viewed24?.c || 0);
  const quoted = Number(quoted24?.c || 0);
  const zalo = Number(zalo24?.c || 0);

  return {
    jobsByStatus,
    last24h: {
      escalation_jobs_created: Number(recentJobs?.c || 0),
      dispatches: disp,
      viewed: viewed,
      quoted: quoted,
      viewed_rate: disp ? viewed / disp : null,
      quote_rate: disp ? quoted / disp : null,
      zalo_dependency_rate: disp ? zalo / disp : null,
    },
    backlog: {
      stale_dispatch_open: Number(staleOpen?.c || 0),
      viewed_no_quote: Number(viewNoQuote?.c || 0),
    },
    latency_seconds_7d: {
      avg_first_view_after_notify: avgViewSec?.sec != null ? Number(avgViewSec.sec) : null,
      avg_quote_after_notify: avgQuoteSec?.sec != null ? Number(avgQuoteSec.sec) : null,
    },
  };
}
