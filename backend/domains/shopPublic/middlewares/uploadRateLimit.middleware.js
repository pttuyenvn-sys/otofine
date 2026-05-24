/**
 * Per-shop rate limit for the public-page image upload endpoints.
 *
 * In-memory token bucket — fine for single-instance PM2 deployment.
 * On HA / multi-instance, swap for Redis. Same pattern lives in the
 * auth domain (`loginRateLimit.middleware.js`).
 */

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 12; // 12 uploads / minute / shop

const buckets = new Map();

function pruneIfStale(entry, now) {
  if (now - entry.startedAt > WINDOW_MS) {
    entry.startedAt = now;
    entry.count = 0;
  }
}

export function publicPageUploadRateLimit(req, res, next) {
  const shopId = req.shop?.id;
  if (!shopId) return next(); // requireShop runs first; should never hit
  const now = Date.now();
  let entry = buckets.get(shopId);
  if (!entry) {
    entry = { startedAt: now, count: 0 };
    buckets.set(shopId, entry);
  } else {
    pruneIfStale(entry, now);
  }
  if (entry.count >= MAX_PER_WINDOW) {
    const retryAfter = Math.max(1, Math.ceil((entry.startedAt + WINDOW_MS - now) / 1000));
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      ok: false,
      error: "Bạn upload quá nhiều ảnh trong thời gian ngắn. Hãy thử lại sau.",
      retryAfter,
    });
  }
  entry.count += 1;
  next();
}
