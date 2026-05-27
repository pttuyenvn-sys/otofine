/**
 * RBAC permission middleware factory.
 *
 * Usage:
 *   router.get("/roles", requireAuth, requireAdmin, requirePermission("rbac:read"), handler);
 *
 * requirePermission(permissionKey) returns an async Express middleware that:
 *   1. Checks ADMIN_RBAC_ENABLED feature flag
 *      - If disabled: calls next() (RBAC is not enforced — requireAdmin already ran)
 *      - On flag resolution error: falls back to adminPlatformConfig.rbacEnabled (ENV) (B3)
 *   2. Defensive role check (belt-and-suspenders after requireAdmin)
 *   3. Sets req.adminPermissionChecked BEFORE calling next() (C3 — audit-log-ready)
 *   4. Resolves permission via hasPermission (Redis → DB)
 *      - If denied: 403 { error: "Forbidden", required: permissionKey }
 *      - If allowed: next()
 *      - On infrastructure failure: getAdminRbac absorbs internally → hasPermission returns false → 403
 *      - On programming error (unexpected throw): 500
 *
 * Middleware ordering requirement (MANDATORY):
 *   requireAuth → requireAdmin → requirePermission
 *   Deviation from this order is a security bug.
 *
 * 403 response shape: { error: "Forbidden", required: permissionKey }
 *   (Differs from requireAdmin's shape { message: "..." } — documented divergence C6)
 */

import { isFeatureEnabled } from "../featureFlags/featureFlag.service.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";
import { hasPermission } from "./rbac.service.js";

/**
 * @param {string} permissionKey  e.g. 'rbac:read', 'shops:write'
 * @returns {import("express").RequestHandler}
 */
export function requirePermission(permissionKey) {
  return async function (req, res, next) {
    // Step 1: Check RBAC feature flag
    // B3: isFeatureEnabled error falls back to ENV value — never unconditional next()
    let rbacEnabled;
    try {
      rbacEnabled = await isFeatureEnabled("ADMIN_RBAC_ENABLED");
    } catch (err) {
      console.error("[rbac:middleware] isFeatureEnabled error:", err.message);
      rbacEnabled = adminPlatformConfig.rbacEnabled; // ENV fallback (B3)
    }

    // RBAC disabled: next() is safe because requireAdmin has already verified role
    if (!rbacEnabled) return next();

    // Step 2: Defensive role check (belt-and-suspenders after requireAdmin)
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!req.user.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Step 3: Set audit marker BEFORE next() (C3)
    // Downstream handlers (e.g. future audit log middleware) can read this field.
    req.adminPermissionChecked = permissionKey;

    // Step 4: Resolve permission
    try {
      const allowed = await hasPermission(req.user.id, permissionKey);
      if (!allowed) {
        return res.status(403).json({ error: "Forbidden", required: permissionKey });
      }
      return next();
    } catch (err) {
      // Programming error only — infrastructure failures are absorbed by getAdminRbac
      // and produce a false return from hasPermission (leading to 403 above).
      console.error("[rbac:middleware] hasPermission unexpected error:", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}
