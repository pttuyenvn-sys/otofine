/**
 * Lightweight in-memory dashboard cache (process-local).
 * TTL defaults to 45s; configurable via GOVERNANCE_DASHBOARD_CACHE_TTL_MS (30–60s recommended).
 */

/** @type {{ payload: object|null, expiresAt: number, cachedAt: number }} */
const cache = {
  payload: null,
  expiresAt: 0,
  cachedAt: 0,
};

function resolveTtlMs() {
  const raw = Number(process.env.GOVERNANCE_DASHBOARD_CACHE_TTL_MS || 45000);
  return Math.max(30_000, Math.min(60_000, raw));
}

export function getGovernanceDashboardCache() {
  if (!cache.payload || Date.now() >= cache.expiresAt) {
    return null;
  }
  return cache.payload;
}

export function setGovernanceDashboardCache(payload) {
  cache.payload = payload;
  cache.cachedAt = Date.now();
  cache.expiresAt = cache.cachedAt + resolveTtlMs();
}

export function invalidateGovernanceDashboardCache() {
  cache.payload = null;
  cache.expiresAt = 0;
  cache.cachedAt = 0;
}

export function getGovernanceDashboardCacheMeta() {
  const cached = Boolean(cache.payload && Date.now() < cache.expiresAt);
  return {
    ttlMs: resolveTtlMs(),
    expiresAt: cache.expiresAt || null,
    cachedAt: cache.cachedAt || null,
    cached,
    ageMs: cached && cache.cachedAt ? Math.max(0, Date.now() - cache.cachedAt) : null,
  };
}
