/** Trusted-proxy aware client IP for RFQ rate limits / viewer throttle */
export function rfqClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
