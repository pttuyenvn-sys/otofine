/**
 * In-memory governance observability metrics (process-local, SAFE MODE).
 */

const MAX_SLOW_QUERIES = 50;

/** @type {{
 *   evaluation: { lastRunAt: string|null, durationMs: number, productsScanned: number, productsSkipped: number, flagsGenerated: number, runs: number },
 *   dashboard: { lastResponseMs: number, lastCacheHit: boolean, lastQueueSize: number, requests: number, cacheHits: number },
 *   slowQueries: Array<{ label: string, durationMs: number, at: string }>
 * }} */
const state = {
  evaluation: {
    lastRunAt: null,
    durationMs: 0,
    productsScanned: 0,
    productsSkipped: 0,
    flagsGenerated: 0,
    failures: 0,
    runs: 0,
  },
  dashboard: {
    lastResponseMs: 0,
    lastCacheHit: false,
    lastQueueSize: 0,
    requests: 0,
    cacheHits: 0,
  },
  slowQueries: [],
};

export function recordEvaluationRun({
  durationMs = 0,
  productsScanned = 0,
  productsSkipped = 0,
  flagsGenerated = 0,
  failures = 0,
} = {}) {
  state.evaluation.runs += 1;
  state.evaluation.lastRunAt = new Date().toISOString();
  state.evaluation.durationMs = Number(durationMs || 0);
  state.evaluation.productsScanned = Number(productsScanned || 0);
  state.evaluation.productsSkipped = Number(productsSkipped || 0);
  state.evaluation.flagsGenerated = Number(flagsGenerated || 0);
  state.evaluation.failures = Number(failures || 0);
}

export function recordDashboardFetch({
  durationMs = 0,
  cacheHit = false,
  queueSize = 0,
} = {}) {
  state.dashboard.requests += 1;
  if (cacheHit) state.dashboard.cacheHits += 1;
  state.dashboard.lastResponseMs = Number(durationMs || 0);
  state.dashboard.lastCacheHit = Boolean(cacheHit);
  state.dashboard.lastQueueSize = Number(queueSize || 0);
}

export function recordSlowQuery({ label, durationMs }) {
  const entry = {
    label: String(label || "unknown"),
    durationMs: Number(durationMs || 0),
    at: new Date().toISOString(),
  };
  state.slowQueries.unshift(entry);
  if (state.slowQueries.length > MAX_SLOW_QUERIES) {
    state.slowQueries.length = MAX_SLOW_QUERIES;
  }
}

export function getGovernanceMetricsSnapshot() {
  const dashReq = state.dashboard.requests || 0;
  const cacheHitRate = dashReq > 0 ? state.dashboard.cacheHits / dashReq : 0;

  return {
    evaluation: { ...state.evaluation },
    dashboard: {
      ...state.dashboard,
      cacheHitRate: Math.round(cacheHitRate * 1000) / 1000,
    },
    slowQueries: [...state.slowQueries],
  };
}

export function resetGovernanceMetricsForTests() {
  state.evaluation = {
    lastRunAt: null,
    durationMs: 0,
    productsScanned: 0,
    productsSkipped: 0,
    flagsGenerated: 0,
    failures: 0,
    runs: 0,
  };
  state.dashboard = {
    lastResponseMs: 0,
    lastCacheHit: false,
    lastQueueSize: 0,
    requests: 0,
    cacheHits: 0,
  };
  state.slowQueries = [];
}
