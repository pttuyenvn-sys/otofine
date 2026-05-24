import { shopsiteLog, anonymizeIp } from "../observability/logger.js";

/**
 * Per-IP rate limiter for the public shopsite GET API.
 *
 * Why a separate limiter from the auth-domain login limiter:
 *   - The auth limiter targets a single endpoint with a strict cap.
 *   - The shopsite is a *catalogue* — buyers naturally page through
 *     20+ products, click into categories, refresh, share, etc. The
 *     cap has to be generous enough that real shopping never hits it,
 *     while still suffocating a slow-and-low scraper.
 *
 * Tiered budgets (per-IP, 1-minute window):
 *
 *   read   — 240 req/min  (shop info / contact: tabs reload + RSC fetches)
 *   list   — 180 req/min  (products list with pagination)
 *   query  —  90 req/min  (fitments, categories: heavy SQL, low churn)
 *
 * On limit hit:
 *   - 429 with `Retry-After` in whole seconds
 *   - JSON body (never HTML — the API contract MUST stay machine-readable)
 *   - `[shopsite] event=ratelimit.public-api ...` log line
 *
 * Process-local token bucket. Single-PM2-instance is fine; if we shard
 * to Redis later the contract is identical (key = "ip:<addr>:tier").
 *
 * Cooperates with the response cache: cache hits still pass through
 * this middleware, so a popular shop slug doesn't let one IP burn
 * the budget on free CPU. That's intentional — the cap is also a
 * fairness signal, not just a CPU brake.
 */
const WINDOW_MS = 60 * 1000;

export const PUBLIC_API_TIERS = Object.freeze({
  read:  { name: "read",  max: 240 },
  list:  { name: "list",  max: 180 },
  query: { name: "query", max:  90 },
});

const buckets = new Map();

function clientIp(req) {
  // The first hop in X-Forwarded-For is set by trusted Nginx; fall
  // back to req.ip for direct connections (dev / docker compose).
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || req.connection?.remoteAddress || "unknown";
}

function bump(key) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now - entry.startedAt > WINDOW_MS) {
    entry = { startedAt: now, count: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  return entry;
}

/**
 * Factory — returns an Express middleware bound to a specific tier.
 *
 *   router.get("/:slug", publicApiRateLimit("read"),  handler)
 *   router.get("/:slug/products", publicApiRateLimit("list"), handler)
 */
export function publicApiRateLimit(tierName) {
  const tier = PUBLIC_API_TIERS[tierName] || PUBLIC_API_TIERS.read;

  return function publicApiRateLimitMiddleware(req, res, next) {
    // Only GET — the public shopsite has no public-side mutations.
    if (req.method !== "GET") return next();

    const ip = clientIp(req);
    const key = `${ip}|${tier.name}`;
    const entry = bump(key);

    if (entry.count > tier.max) {
      const retryAfter = Math.max(
        1,
        Math.ceil((entry.startedAt + WINDOW_MS - Date.now()) / 1000),
      );
      res.set("Retry-After", String(retryAfter));
      res.set("X-RateLimit-Tier", tier.name);
      shopsiteLog.warn("storefront.rate-limited", {
        tier: tier.name,
        ip: anonymizeIp(ip),
        count: entry.count,
        cap: tier.max,
        path: req.path,
        retry_s: retryAfter,
      });
      return res.status(429).json({
        error: "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
        retryAfter,
      });
    }
    next();
  };
}

/**
 * Snapshot for debug / metrics endpoint.
 * Returns `{ tier, ip, count, secondsLeft }[]` — top 20 by count.
 */
export function getPublicApiRateStats() {
  const now = Date.now();
  const rows = [];
  for (const [key, entry] of buckets) {
    const [ip, tier] = key.split("|");
    rows.push({
      tier,
      ip: anonymizeIp(ip),
      count: entry.count,
      seconds_left: Math.max(
        0,
        Math.ceil((entry.startedAt + WINDOW_MS - now) / 1000),
      ),
    });
  }
  rows.sort((a, b) => b.count - a.count);
  return {
    window_ms: WINDOW_MS,
    tiers: PUBLIC_API_TIERS,
    bucket_count: buckets.size,
    top: rows.slice(0, 20),
  };
}

/** For tests + ops: clear all buckets. */
export function _resetPublicApiRateBuckets() {
  buckets.clear();
}
