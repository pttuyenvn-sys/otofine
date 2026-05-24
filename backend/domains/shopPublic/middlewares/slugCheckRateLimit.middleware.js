import { shopsiteLog, anonymizeIp } from "../observability/logger.js";

/**
 * Per-IP AND per-account rate limit for /check-slug.
 *
 * Why both axes: a logged-in seller could only have one IP per session
 * but might script slug enumeration; conversely an IP behind a NAT
 * carrying multiple sellers should be limited collectively. We require
 * BOTH dimensions to be under the cap.
 *
 * 30 requests / 5 minutes per axis. Same in-memory token-bucket
 * pattern as `uploadRateLimit.middleware.js` and the auth-domain
 * `loginRateLimit.middleware.js`.
 *
 * On limit hit:
 *   - 429 with Retry-After in seconds
 *   - structured `[shopsite] event=ratelimit.slug-check ...` log
 */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 30;

const ipBuckets = new Map();
const accountBuckets = new Map();

function bump(map, key) {
  const now = Date.now();
  let entry = map.get(key);
  if (!entry || now - entry.startedAt > WINDOW_MS) {
    entry = { startedAt: now, count: 0 };
    map.set(key, entry);
  }
  entry.count += 1;
  return entry;
}

function clientIp(req) {
  // Trust the first IP in X-Forwarded-For when set by our trusted
  // Nginx; otherwise fall back to req.ip (Express's parsed value).
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || req.connection?.remoteAddress || "unknown";
}

export function slugCheckRateLimit(req, res, next) {
  const ip = clientIp(req);
  const accountId = req.user?.accountId ?? req.user?.id ?? "anon";

  const ipEntry = bump(ipBuckets, ip);
  const accEntry = bump(accountBuckets, `acc:${accountId}`);

  if (ipEntry.count > MAX_PER_WINDOW || accEntry.count > MAX_PER_WINDOW) {
    const retryAfter = Math.max(
      1,
      Math.ceil(
        (Math.max(ipEntry.startedAt, accEntry.startedAt) + WINDOW_MS - Date.now()) / 1000,
      ),
    );
    res.set("Retry-After", String(retryAfter));
    shopsiteLog.warn("ratelimit.slug-check", {
      ip: anonymizeIp(ip),
      accountId,
      ip_count: ipEntry.count,
      acc_count: accEntry.count,
      retry_s: retryAfter,
    });
    return res.status(429).json({
      ok: false,
      error: "Bạn kiểm tra slug quá nhiều lần. Hãy thử lại sau.",
      retryAfter,
    });
  }
  next();
}
