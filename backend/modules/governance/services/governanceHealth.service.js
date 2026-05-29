import { countPendingProductsNeedingEvaluation } from "./riskEvaluation.service.js";
import { getGovernanceMetricsSnapshot } from "./governanceMetrics.service.js";
import { getGovernanceDashboardCacheMeta } from "./governanceDashboardCache.server.js";
import { getWorkerStatusFromHeartbeat } from "./governanceWorkerHeartbeat.server.js";
import { getWorkerLockStatus } from "./governanceWorkerLock.server.js";

/**
 * Assemble governance health snapshot for ops monitoring.
 */
export async function getGovernanceHealthSnapshot() {
  const worker = getWorkerStatusFromHeartbeat();
  const workerLock = getWorkerLockStatus();
  const cache = getGovernanceDashboardCacheMeta();
  const metrics = getGovernanceMetricsSnapshot();
  const pendingEvaluations = await countPendingProductsNeedingEvaluation({
    skipMinutes: Number(process.env.GOVERNANCE_RISK_SKIP_MINUTES || 10),
  });

  const cacheAgeMs =
    cache.cachedAt && cache.cached
      ? Math.max(0, Date.now() - cache.cachedAt)
      : null;

  return {
    worker: {
      online: worker.online,
      status: worker.status,
      process: worker.heartbeat?.process || "governance-risk-worker",
      pid: worker.heartbeat?.pid || null,
      lastRunAt: worker.heartbeat?.lastRunAt || metrics.evaluation.lastRunAt || null,
      lastSuccessAt: worker.heartbeat?.lastSuccessAt || null,
      lastError: worker.heartbeat?.lastError || null,
      nextRunAt: worker.heartbeat?.nextRunAt || null,
      heartbeatAgeMs: worker.ageMs,
      staleThresholdMs: worker.staleMs,
      lock: {
        locked: workerLock.locked,
        holderPid: workerLock.holder?.pid || null,
        ageMs: workerLock.ageMs ?? null,
        staleMs: workerLock.staleMs,
      },
    },
    cache: {
      cached: cache.cached,
      ttlMs: cache.ttlMs,
      expiresAt: cache.expiresAt,
      ageMs: cacheAgeMs,
    },
    pendingEvaluations,
    slowQueries: {
      count: metrics.slowQueries.length,
      recent: metrics.slowQueries.slice(0, 10),
    },
    evaluation: {
      lastRunAt: metrics.evaluation.lastRunAt,
      durationMs: metrics.evaluation.durationMs,
      productsScanned: metrics.evaluation.productsScanned,
      productsSkipped: metrics.evaluation.productsSkipped,
      flagsGenerated: metrics.evaluation.flagsGenerated,
      failures: metrics.evaluation.failures || 0,
      runs: metrics.evaluation.runs,
    },
    dashboard: {
      lastResponseMs: metrics.dashboard.lastResponseMs,
      cacheHitRate: metrics.dashboard.cacheHitRate,
      lastQueueSize: metrics.dashboard.lastQueueSize,
    },
  };
}
