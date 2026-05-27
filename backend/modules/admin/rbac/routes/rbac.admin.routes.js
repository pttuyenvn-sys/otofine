/**
 * RBAC management routes.
 *
 * All routes require: requireAuth → requireAdmin → requirePermission(key)
 *
 * Startup gate (B1 fix — registered BEFORE named routes):
 *   Express matches routes in registration order. router.use() (catch-all) only fires
 *   for requests not matched by earlier named routes. To guarantee ALL requests to this
 *   router return 404 when RBAC is disabled, the catch-all is registered FIRST.
 *
 *   When ADMIN_RBAC_ENABLED=false in ENV at process start:
 *     → catch-all registered first → ALL /api/admin/rbac/* requests return 404
 *     → no named route below is consulted (requireAuth/requireAdmin never run)
 *
 *   When ADMIN_RBAC_ENABLED=true in ENV at process start:
 *     → catch-all NOT registered → named routes match normally
 *     → requirePermission provides the per-request runtime gate
 *
 * Express 5 / path-to-regexp@8 compatibility:
 *   router.use((req, res) => ...)  ← CORRECT
 *   router.use("*", ...)           ← WRONG (startup crash in Express 5)
 *
 * export default router is REQUIRED — admin/index.js barrel uses:
 *   export { default as rbacRouter } from "./rbac/routes/rbac.admin.routes.js"
 */

import express from "express";
import { requireAuth, requireAdmin } from "../../../../middlewares/auth.js";
import { requirePermission } from "../../core/rbac/rbac.middleware.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";
import {
  getRoles,
  getPermissions,
  getAdminRoles,
  assignRole,
  revokeRole,
} from "../controllers/rbac.admin.controller.js";

const router = express.Router();

// ── Startup gate (MUST be registered BEFORE named routes) ───────────────────
// B1 fix: when ADMIN_RBAC_ENABLED=false in ENV, this catch-all fires first for
// every request — no named route below is reachable. When true, this block does
// not execute and named routes match normally.
// Express 5 safe: router.use(handler) with no path argument.
if (!adminPlatformConfig.rbacEnabled) {
  router.use((req, res) => {
    return res.status(404).json({ error: "not found" });
  });
}

// ── Read routes (rbac:read) ──────────────────────────────────────────────────
// Reachable only when adminPlatformConfig.rbacEnabled = true at startup.
// requirePermission provides a secondary per-request runtime gate (e.g. for
// DB-driven toggling while the process is running).

router.get(
  "/roles",
  requireAuth, requireAdmin, requirePermission("rbac:read"),
  getRoles,
);

router.get(
  "/permissions",
  requireAuth, requireAdmin, requirePermission("rbac:read"),
  getPermissions,
);

router.get(
  "/admins/:adminId/roles",
  requireAuth, requireAdmin, requirePermission("rbac:read"),
  getAdminRoles,
);

// ── Write routes (rbac:manage) ───────────────────────────────────────────────

router.post(
  "/admins/:adminId/roles",
  requireAuth, requireAdmin, requirePermission("rbac:manage"),
  assignRole,
);

router.delete(
  "/admins/:adminId/roles/:roleId",
  requireAuth, requireAdmin, requirePermission("rbac:manage"),
  revokeRole,
);

export default router;
