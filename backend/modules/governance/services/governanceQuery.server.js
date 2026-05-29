import { logSlowQuery } from "./governanceLogger.server.js";
import { recordSlowQuery } from "./governanceMetrics.service.js";

const SLOW_QUERY_MS = Math.max(
  100,
  Number(process.env.GOVERNANCE_SLOW_QUERY_MS || 500),
);

/**
 * Execute an async governance query with duration tracking and slow-query warnings.
 * @param {string} label
 * @param {() => Promise<unknown>} fn
 */
export async function timedGovernanceQuery(label, fn) {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const durationMs = Date.now() - start;
    if (durationMs >= SLOW_QUERY_MS) {
      recordSlowQuery({ label, durationMs });
      logSlowQuery({ label, durationMs, thresholdMs: SLOW_QUERY_MS });
    }
  }
}
