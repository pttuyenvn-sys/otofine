/**
 * Admin Session Validation Middleware — Slice 5
 *
 * requireAdminSession:
 *   - Flag disabled (default): pass-through immediately (no DB/Redis lookups)
 *   - Flag enabled: validate session via Redis blocklist → DB
 *   - Legacy JWTs (no sid): pass-through (backward compatibility)
 *   - Fail-closed when governance enabled + DB unavailable
 *
 * Placed in middleware chain AFTER requireAuth + requireAdmin:
 *   requireAuth → requireAdmin → requireAdminSession → [route handler]
 *
 * No startup side effects: no module-load DB/Redis connections.
 */

import { pool } from "../../../../config/db.js";
import { getRaw, setRaw } from "../../../../services/redisCache.service.js";
import { isFeatureEnabled } from "../featureFlags/featureFlag.service.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";

// ---------------------------------------------------------------------------
// Local helper — mirrors adminSession.service.js without cross-import
// ---------------------------------------------------------------------------

function parseDurationMs(str, defaultMs = 7 * 24 * 60 * 60 * 1000) {
  if (!str || typeof str !== "string") return defaultMs;
  const match = str.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/i);
  if (!match) return defaultMs;
  const n = parseFloat(match[1]);
  const unit = (match[2] || "ms").toLowerCase();
  switch (unit) {
    case "ms": return n;
    case "s":  return n * 1_000;
    case "m":  return n * 60_000;
    case "h":  return n * 3_600_000;
    case "d":  return n * 86_400_000;
    case "w":  return n * 604_800_000;
    default:   return defaultMs;
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Validates that the admin's current session (identified by req.user.sid) is
 * active — not revoked and not expired.
 *
 * Sets req.adminSessionId on success (for downstream use by future MFA middleware).
 */
export async function requireAdminSession(req, res, next) {
  // Step 1: Check ADMIN_SESSION_GOVERNANCE_ENABLED
  let governanceEnabled = false;
  try {
    governanceEnabled = await isFeatureEnabled("ADMIN_SESSION_GOVERNANCE_ENABLED");
  } catch {
    governanceEnabled = adminPlatformConfig.sessionGovernanceEnabled ?? false;
  }

  if (!governanceEnabled) {
    return next(); // pass-through: governance disabled (default state)
  }

  // Step 2: Check req.user.sid (absent on legacy JWTs without sid)
  if (!req.user?.sid) {
    return next(); // backward compatible: pre-Slice 5 tokens pass through
  }

  const sid = req.user.sid;

  // Step 3: Redis blocklist fast-path
  try {
    const revoked = await getRaw(`admin:session:revoked:${sid}`);
    if (revoked === "1") {
      return res.status(401).json({ error: "Session revoked" });
    }
    // null = cache miss → proceed to DB check
  } catch {
    // Redis failure — fall through to DB check (source of truth)
  }

  // Step 4: DB session lookup (fail-closed on DB error)
  try {
    const [rows] = await pool.query(
      `SELECT id, revoked_at, expires_at
       FROM admin_sessions
       WHERE id = ? AND admin_id = ?`,
      [sid, req.user.id],
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Session not found" });
    }

    const session = rows[0];

    if (session.revoked_at !== null) {
      // Populate Redis cache to short-circuit future checks
      const JWT_TTL_MS = parseDurationMs(
        process.env.AUTH_ADMIN_ACCESS_EXPIRES ||
        process.env.AUTH_ACCESS_EXPIRES ||
        "7d",
      );
      const sessionRemainingMs = Math.max(
        0,
        new Date(session.expires_at).getTime() - Date.now(),
      );
      const ttlMs = Math.min(sessionRemainingMs, JWT_TTL_MS);
      if (ttlMs > 0) {
        setRaw(`admin:session:revoked:${sid}`, "1", ttlMs).catch(() => {});
      }
      return res.status(401).json({ error: "Session revoked" });
    }

    if (new Date(session.expires_at) <= new Date()) {
      return res.status(401).json({ error: "Session expired" });
    }

    req.adminSessionId = session.id;
    return next();
  } catch (err) {
    console.error("[admin:session:middleware] DB error:", err.message);
    return res.status(401).json({ error: "Session validation failed" });
  }
}
