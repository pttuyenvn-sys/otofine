/**
 * In-memory brute-force shield for opaque viewer tokens (per-process).
 * Does not replace IP rate limits — layers defense.
 */

const byIp = new Map(); // ip -> { fail: number, lockedUntil: number }
const BY_TOKEN_PREFIX = new Map(); // `${ip}:${pfx}` -> fails

export function viewerThrottleConfig() {
  return {
    maxFailsPerIp: Number(process.env.RFQ_VIEWER_BRUTE_IP_MAX || 40),
    lockMs: Number(process.env.RFQ_VIEWER_BRUTE_LOCK_MS || 900_000),
    maxFailsPerTokenPrefix: Number(process.env.RFQ_VIEWER_BRUTE_TOKEN_MAX || 15),
    tokenPrefixLen: 12,
  };
}

export function tokenPrefix(raw) {
  const s = String(raw || "").trim();
  const { tokenPrefixLen } = viewerThrottleConfig();
  return s.slice(0, Math.min(tokenPrefixLen, s.length));
}

export function assertViewerLookupAllowed(ip, rawToken) {
  const cfg = viewerThrottleConfig();
  const now = Date.now();
  const ipEntry = byIp.get(ip) || { fail: 0, lockedUntil: 0 };
  if (ipEntry.lockedUntil > now) {
    const err = new Error("VIEWER_LOCKED");
    err.status = 429;
    err.lockRemainingSec = Math.ceil((ipEntry.lockedUntil - now) / 1000);
    throw err;
  }
  const pfx = tokenPrefix(rawToken);
  const tk = `${ip}:${pfx}`;
  const tf = BY_TOKEN_PREFIX.get(tk) || 0;
  if (tf >= cfg.maxFailsPerTokenPrefix) {
    const err = new Error("VIEWER_TOKEN_BRUTE");
    err.status = 429;
    throw err;
  }
}

export function recordViewerAuthSuccess(ip) {
  byIp.delete(ip);
}

export function recordViewerAuthFailure(ip, rawToken) {
  const cfg = viewerThrottleConfig();
  const now = Date.now();
  const ipEntry = byIp.get(ip) || { fail: 0, lockedUntil: 0 };
  ipEntry.fail += 1;
  if (ipEntry.fail >= cfg.maxFailsPerIp) {
    ipEntry.lockedUntil = now + cfg.lockMs;
    ipEntry.fail = 0;
  }
  byIp.set(ip, ipEntry);

  const pfx = tokenPrefix(rawToken);
  const tk = `${ip}:${pfx}`;
  BY_TOKEN_PREFIX.set(tk, (BY_TOKEN_PREFIX.get(tk) || 0) + 1);
}
