import { authConfig } from "../config/auth.config.js";

const buckets = new Map();

function clientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * In-memory sliding window rate limit (same pattern as RFQ).
 * Replace with Redis when running multiple API instances.
 */
export function createAuthRateLimit({ windowMs, max, bucketPrefix }) {
  return function authRateLimitMw(req, res, next) {
    const key = `${bucketPrefix}:${clientKey(req)}`;
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({
        message: "Quá nhiều yêu cầu — thử lại sau",
        code: "RATE_LIMIT",
      });
    }
    next();
  };
}

export const shopLoginRateLimit = createAuthRateLimit({
  windowMs: authConfig.loginRateWindowMs,
  max: authConfig.loginRateMax,
  bucketPrefix: "shop_login",
});

export const shopRegisterRateLimit = createAuthRateLimit({
  windowMs: authConfig.loginRateWindowMs,
  max: Math.max(5, Math.floor(authConfig.loginRateMax / 2)),
  bucketPrefix: "shop_register",
});

export const shopForgotRateLimit = createAuthRateLimit({
  windowMs: authConfig.loginRateWindowMs,
  max: Math.max(5, Math.floor(authConfig.loginRateMax / 3)),
  bucketPrefix: "shop_forgot",
});
