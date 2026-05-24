import { allCacheStats } from "../cache/caches.js";
import { getMiddlewareStats } from "../observability/middlewareStats.js";

/**
 * GET /api/public/shops/debug/cache
 *
 * Returns counters for both caches plus middleware stats. DEV / non-
 * production only. Returns 404 in production so existence cannot leak
 * via timing or schema enumeration.
 *
 * Not authenticated — the payload is non-sensitive (counters only).
 * In production, the route effectively doesn't exist.
 */
export function handleGetCacheDebug(req, res) {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  res.set("Cache-Control", "no-store");
  res.json({
    node_env: process.env.NODE_ENV || "development",
    uptime_s: Math.round(process.uptime()),
    caches: allCacheStats(),
    middleware: getMiddlewareStats(),
    process: {
      rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  });
}
