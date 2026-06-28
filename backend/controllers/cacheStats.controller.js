import { getBackendCacheStatsSnapshot } from "../services/redisCache.service.js";

/**
 * GET /api/admin/cache-stats
 * Process-local observability for getOrSetCache-backed entries.
 */
export async function getCacheStats(req, res) {
  try {
    return res.json({
      backendCache: getBackendCacheStatsSnapshot(),
    });
  } catch (err) {
    console.error("[cache-stats]", err);
    return res.status(500).json({
      backendCache: {
        keys: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        memoryMB: 0,
      },
    });
  }
}
