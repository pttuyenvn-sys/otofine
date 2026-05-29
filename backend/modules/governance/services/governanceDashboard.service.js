import { pool } from "../../../config/db.js";
import { buildPublicProductWhereClause } from "../../products/services/productPublicVisibility.server.js";
import {
  aggregateRiskBuckets,
  getCriticalProducts,
  getCriticalShops,
  getHighRiskProductAlerts,
  getHighRiskShopAlerts,
  getRecentEnforcementEvents,
} from "./riskEvaluation.service.js";
import { timedGovernanceQuery } from "./governanceQuery.server.js";
import {
  getGovernanceDashboardCache,
  setGovernanceDashboardCache,
  getGovernanceDashboardCacheMeta,
} from "./governanceDashboardCache.server.js";
import {
  getGovernanceMetricsSnapshot,
  recordDashboardFetch,
} from "./governanceMetrics.service.js";

/**
 * Read-only governance dashboard assembly (no risk evaluation side effects).
 */
export async function fetchGovernanceDashboardData() {
  const [modRows] = await timedGovernanceQuery("dashboard.moderationCounts", () =>
    pool.query(
      `
      SELECT
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'pending_review' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN e.new_status = 'approved' AND DATE(e.created_at) = CURDATE() THEN 1 ELSE 0 END) AS approvedToday,
        SUM(CASE WHEN e.new_status = 'rejected' AND DATE(e.created_at) = CURDATE() THEN 1 ELSE 0 END) AS rejectedToday
      FROM products p
      LEFT JOIN product_moderation_events e ON e.product_id = p.id
    `,
      [],
    ),
  );
  const moderation = modRows?.[0] || { pending: 0, approvedToday: 0, rejectedToday: 0 };

  const risk = await timedGovernanceQuery("dashboard.riskBuckets", () => aggregateRiskBuckets());

  const [[{ publicShops }]] = await timedGovernanceQuery("dashboard.publicShops", () =>
    pool.query(`SELECT COUNT(*) AS publicShops FROM shops WHERE TRIM(LOWER(public_status)) = 'public'`),
  );

  let publicProducts = 0;
  try {
    const vis = await buildPublicProductWhereClause({ aliasP: "p", skipShopGate: true });
    const [pp] = await timedGovernanceQuery("dashboard.publicProducts", () =>
      pool.query(`SELECT COUNT(*) AS n FROM products p ${vis.sql}`, vis.params || []),
    );
    publicProducts = Number(pp[0]?.n) || 0;
  } catch {
    const [[{ n }]] = await timedGovernanceQuery("dashboard.publicProducts.fallback", () =>
      pool.query(`SELECT COUNT(*) AS n FROM products`),
    );
    publicProducts = Number(n) || 0;
  }

  const queue = { pending: Number(moderation.pending || 0) };

  const [[{ activeSessions }]] = await timedGovernanceQuery("dashboard.activeSessions", () =>
    pool.query(
      `SELECT COUNT(*) AS activeSessions FROM admin_sessions s WHERE s.revoked_at IS NULL AND s.expires_at > NOW()`,
    ),
  );

  const [recentRows] = await timedGovernanceQuery("dashboard.recentActivity", () =>
    pool.query(
      `
      SELECT
        e.id,
        e.product_id AS productId,
        a.email AS moderatorEmail,
        e.old_status AS oldStatus,
        e.new_status AS newStatus,
        e.reject_reason AS rejectReason,
        e.notes AS notes,
        e.created_at AS createdAt
      FROM product_moderation_events e
      LEFT JOIN admin a ON a.id = e.moderator_admin_id
      ORDER BY e.created_at DESC
      LIMIT 20
    `,
      [],
    ),
  );

  const [criticalShops, criticalProducts, highRiskShops, highRiskProducts, recentEnforcementEvents] =
    await Promise.all([
      timedGovernanceQuery("dashboard.criticalShops", () => getCriticalShops({ limit: 10 })),
      timedGovernanceQuery("dashboard.criticalProducts", () => getCriticalProducts({ limit: 10 })),
      timedGovernanceQuery("dashboard.highRiskShops", () => getHighRiskShopAlerts({ limit: 10 })),
      timedGovernanceQuery("dashboard.highRiskProducts", () => getHighRiskProductAlerts({ limit: 10 })),
      timedGovernanceQuery("dashboard.enforcementEvents", () => getRecentEnforcementEvents({ limit: 20 })),
    ]);

  return {
    moderation,
    risk,
    marketplace: { publicShops: Number(publicShops || 0), publicProducts: Number(publicProducts || 0) },
    queue,
    sessions: { active: Number(activeSessions || 0) },
    recentActivity: recentRows || [],
    alerts: {
      highRiskShops,
      highRiskProducts,
    },
    criticalShops,
    criticalProducts,
    recentEnforcementEvents,
  };
}

/**
 * Cached read-only dashboard fetch with observability metadata.
 */
export async function getGovernanceDashboardCached() {
  const started = Date.now();
  const cached = getGovernanceDashboardCache();

  if (cached) {
    const durationMs = Date.now() - started;
    recordDashboardFetch({
      durationMs,
      cacheHit: true,
      queueSize: cached.queue?.pending || 0,
    });
    return {
      ...cached,
      observability: {
        cacheHit: true,
        responseTimeMs: durationMs,
        cache: getGovernanceDashboardCacheMeta(),
        metrics: getGovernanceMetricsSnapshot(),
      },
    };
  }

  const data = await fetchGovernanceDashboardData();
  setGovernanceDashboardCache(data);

  const durationMs = Date.now() - started;
  recordDashboardFetch({
    durationMs,
    cacheHit: false,
    queueSize: data.queue?.pending || 0,
  });

  return {
    ...data,
    observability: {
      cacheHit: false,
      responseTimeMs: durationMs,
      cache: getGovernanceDashboardCacheMeta(),
      metrics: getGovernanceMetricsSnapshot(),
    },
  };
}
