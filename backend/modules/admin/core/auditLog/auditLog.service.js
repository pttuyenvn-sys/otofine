/**
 * Audit log service — Slice 4 Foundation.
 *
 * Provides logAdminAction() for append-only audit writes.
 *
 * Design constraints:
 *   - Best-effort: write failures never block the calling controller.
 *   - Feature-flag gated: ADMIN_AUDIT_LOG_ENABLED checked at call time.
 *   - Append-only: only INSERT SQL is present in this module.
 *   - sanitizeSnapshot is internal — NOT exported.
 *
 * Sensitive field stripping (sanitizeSnapshot):
 *   Fields matching BLOCKED_FIELDS (case-insensitive, exact key name) are
 *   replaced with "[REDACTED]" at any nesting depth.
 *
 * IP capture (C3 design patch):
 *   Primary source: X-Forwarded-For (Nginx sets this).
 *   Fallback: req.ip if it is not the loopback address 127.0.0.1.
 *   If neither source yields a real client IP, ip_address is stored as null.
 *
 * Sanitization failure (C1 design patch):
 *   On sanitizeSnapshot failure, null is used for the affected snapshot field.
 *   The unsanitized original is never used as a fallback.
 */

import crypto from "node:crypto";
import { pool } from "../../../../config/db.js";
import { isFeatureEnabled } from "../featureFlags/featureFlag.service.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";

// ---------------------------------------------------------------------------
// Sensitive field blocklist (case-insensitive exact key name match)
// ---------------------------------------------------------------------------

const BLOCKED_FIELDS = new Set([
  "password",
  "passwordhash",
  "hashedpassword",
  "hash",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "secret",
  "apikey",
  "apisecret",
  "clientsecret",
  "otp",
  "totp",
  "pin",
  "sessionid",
  "sessiontoken",
  "privatekey",
  "signingkey",
]);

// ---------------------------------------------------------------------------
// sanitizeSnapshot — internal only
// ---------------------------------------------------------------------------

/**
 * Deep-clones obj and redacts any key matching BLOCKED_FIELDS at any depth.
 * Returns null on failure (circular references, serialization errors, etc.).
 * Arrays: each element is sanitized recursively.
 * Primitives / null / undefined: returned as-is.
 *
 * @param {*} obj
 * @returns {*} sanitized clone, or null on failure
 */
function sanitizeSnapshot(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  try {
    // Deep clone via JSON round-trip. Rejects circular refs and BigInt (throws).
    const clone = JSON.parse(JSON.stringify(obj));
    return redactDeep(clone);
  } catch (err) {
    console.warn("[audit:log] sanitizeSnapshot failed:", err.message);
    return null;
  }
}

/**
 * Recursively walks a plain-object / array and replaces blocked keys.
 * Mutates the cloned object in-place (safe — clone is not shared).
 */
function redactDeep(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = redactDeep(value[i]);
    }
    return value;
  }

  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (BLOCKED_FIELDS.has(key.toLowerCase())) {
        value[key] = "[REDACTED]";
      } else {
        value[key] = redactDeep(value[key]);
      }
    }
    return value;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Size limit check — internal
// ---------------------------------------------------------------------------

const MAX_SNAPSHOT_BYTES = 65536; // 64 KB

/**
 * Enforces a 64 KB size limit on a sanitized snapshot.
 * Returns the snapshot as-is if within limit, or a truncation marker if not.
 *
 * @param {*} snapshot  already-sanitized object (or null)
 * @param {string} action  for the warning log
 * @param {string} field   "before" or "after" for the warning log
 * @returns {*}
 */
function enforceSnapshotSize(snapshot, action, field) {
  if (snapshot === null || snapshot === undefined) return snapshot;

  try {
    const serialized = JSON.stringify(snapshot);
    if (serialized.length > MAX_SNAPSHOT_BYTES) {
      console.warn(
        `[audit:log] ${field} snapshot truncated for action "${action}" (${serialized.length} bytes)`,
      );
      return {
        _truncated: true,
        _reason: "snapshot exceeded 64KB",
        _keys: Object.keys(snapshot),
      };
    }
    return snapshot;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// logAdminAction — exported
// ---------------------------------------------------------------------------

/**
 * Writes an append-only audit log entry for an admin action.
 *
 * Best-effort: all errors are caught and swallowed. The caller never sees
 * a thrown error from this function.
 *
 * Logging order contract (design §5.2):
 *   Call this AFTER the business DB write succeeds and AFTER cache invalidation.
 *   Never call this before the business write — no phantom entries for failed actions.
 *
 * @param {object} params
 * @param {number}      params.adminId      req.user.id — the acting admin
 * @param {string}      params.action       "rbac.role.assign" | "rbac.role.revoke" | ...
 * @param {string}      params.targetType   "admin_user_roles" | "shop" | ...
 * @param {number|null} params.targetId     numeric ID of the affected entity (or null)
 * @param {object|null} params.before       entity state before the action (or null for CREATE)
 * @param {object|null} params.after        entity state after the action (or null for DELETE)
 * @param {object}      params.req          Express request object
 * @returns {Promise<void>}
 */
export async function logAdminAction({
  adminId,
  action,
  targetType,
  targetId,
  before,
  after,
  req,
}) {
  try {
    // ── Feature flag gate (call-time — enables hot toggle without PM2 restart) ──
    let enabled = false;
    try {
      enabled = await isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED");
    } catch {
      // Redis + DB both failed: fall back to ENV value (B3 pattern from requirePermission)
      enabled = adminPlatformConfig.auditLogEnabled ?? false;
    }

    if (!enabled) return;

    // ── Sanitize snapshots (C1: failure → null, not a placeholder object) ──
    const sanitizedBefore = sanitizeSnapshot(before);
    const sanitizedAfter  = sanitizeSnapshot(after);

    // ── Enforce 64 KB size limit ──
    const finalBefore = enforceSnapshotSize(sanitizedBefore, action, "before");
    const finalAfter  = enforceSnapshotSize(sanitizedAfter,  action, "after");

    // ── Capture request metadata (C3: X-Forwarded-For primary, loopback guard) ──
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
             ?? (req.ip !== "127.0.0.1" ? req.ip : null);
    const ua  = (req.headers["user-agent"] ?? "").slice(0, 512);
    const permissionChecked = req.adminPermissionChecked ?? null;

    // ── Generate request_id ──
    let requestId;
    try {
      requestId = crypto.randomUUID();
    } catch {
      requestId = Date.now().toString();
    }

    const metadata = JSON.stringify({ request_id: requestId, correlation_id: null });

    // ── INSERT ──
    await pool.query(
      `INSERT INTO admin_audit_log
         (admin_id, actor_type, action, target_type, target_id,
          before_json, after_json, ip_address, user_agent,
          permission_checked, metadata_json)
       VALUES (?, 'admin', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId,
        action,
        targetType   ?? null,
        targetId     ?? null,
        finalBefore != null ? JSON.stringify(finalBefore) : null,
        finalAfter  != null ? JSON.stringify(finalAfter)  : null,
        ip           ?? null,
        ua           || null,
        permissionChecked,
        metadata,
      ],
    );
  } catch (err) {
    // Best-effort: swallow all errors. Never propagate to the controller.
    console.error("[audit:log] write failed:", err.message);
  }
}
