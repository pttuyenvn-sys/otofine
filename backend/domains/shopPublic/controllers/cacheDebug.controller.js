import { allCacheStats } from "../cache/caches.js";
import { getMiddlewareStats } from "../observability/middlewareStats.js";
import { getPublicApiRateStats } from "../middlewares/publicApiRateLimit.middleware.js";
import { getAbuseStats } from "../observability/abuseDetector.js";

/**
 * GET /api/public/shops/debug/cache
 *
 * Returns counters for both caches, the per-IP rate-limit buckets, the
 * bot/abuse detector counters, and the subdomain middleware stats.
 * DEV / non-production only. Returns 404 in production so existence
 * cannot leak via timing or schema enumeration.
 *
 * Not authenticated — the payload is non-sensitive (anonymized IPs +
 * counters only, never bodies / headers / JWTs). In production the
 * route effectively doesn't exist.
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
    rate_limit: getPublicApiRateStats(),
    abuse: getAbuseStats(),
    process: {
      rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  });
}
