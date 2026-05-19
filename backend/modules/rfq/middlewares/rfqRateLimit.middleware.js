/** Sliding-window-ish rate limiter, in-memory — adequate for MVP single instance */

import { rfqClientIp } from "../utils/rfqNet.js";

const hits = new Map();

export function rfqRateLimit({ windowMs, max, bucketPrefix, keyFn }) {
  return function rfqRateLimitMw(req, res, next) {
    const baseKey = typeof keyFn === "function" ? keyFn(req) : rfqClientIp(req);
    const bucket = `${bucketPrefix}:${baseKey}`;
    const now = Date.now();
    let arr = hits.get(bucket);
    if (!arr) arr = [];
    arr = arr.filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
      return res.status(429).json({
        code: "RATE_LIMIT",
        message: "Quá nhiều yêu cầu — thử lại sau",
      });
    }
    arr.push(now);
    hits.set(bucket, arr);
    next();
  };
}
