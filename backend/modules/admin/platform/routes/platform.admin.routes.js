/**
 * Admin platform routes.
 *
 * Route registration order is mandatory (design §6.2 + B1 constraint):
 *   1. /features registered UNCONDITIONALLY before any gate
 *   2. Platform-enabled catch-all gate for all FUTURE routes (Slice 3+)
 *
 * This file uses `export default router` — required by admin/index.js barrel
 * which uses `export { default as platformRouter }`.
 *
 * B1 patch: router.use(handler) without path — Express 5 / path-to-regexp@8
 * does not accept bare '*' as a wildcard. router.use(handler) correctly
 * catches all requests not already matched by registered routes above it.
 */

import express from "express";
import { requireAuth, requireAdmin } from "../../../../middlewares/auth.js";
import { getFeatures } from "../controllers/platform.admin.controller.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";
import { requirePermission } from "../../core/rbac/rbac.middleware.js";
import { requireAdminSession } from "../../core/adminSession/adminSession.middleware.js";
import { listAuditLog } from "../controllers/auditLog.admin.controller.js";
import { listActiveAdminSessions, revokeAdminSession } from "../controllers/adminSessions.admin.controller.js";
import { listModerationQueue, listModerationShops, bulkModerateProducts, getProductModerationEvents, getProductModerationDetailHandler } from "../controllers/productModeration.admin.controller.js";
import { resetModerationStatus, getModerationStats } from "../controllers/productModeration.admin.controller.js";
import { listShopRisk } from "../../../governance/controllers/shopRisk.admin.controller.js";
import { getGovernanceDashboard, getGovernanceHealth } from "../controllers/governance.admin.controller.js";
import { getShopGovernance, postShopGovernanceAction } from "../controllers/shopGovernance.admin.controller.js";
import { isFeatureEnabled } from "../../index.js";

const router = express.Router();

// Step 1 — /features is ALWAYS registered, regardless of platformEnabled state.
// This must remain the FIRST route registration in this file.
router.get("/features", requireAuth, requireAdmin, getFeatures);

// Step 2 — Slice 2 route(s).
router.get(
  "/audit-log",
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("audit_log:read"),
  listAuditLog,
);

router.get(
  "/sessions",
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("platform:read"),
  listActiveAdminSessions,
);

router.post(
  "/sessions/:id/revoke",
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("platform:read"),
  revokeAdminSession,
);

// ── Phase 3A: Product Moderation Queue (feature-flag gated like Slice 6) ─────

async function requireModerationEnabled(req, res, next) {
  try {
    const enabled = await isFeatureEnabled("ADMIN_MODERATION_ENABLED");
    if (!enabled) return res.status(404).json({ error: "not found" });
    return next();
  } catch {
    if (!adminPlatformConfig.moderationEnabled) {
      return res.status(404).json({ error: "not found" });
    }
    return next();
  }
}

router.get(
  "/products/moderation",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("moderation:read"),
  listModerationQueue,
);

router.post(
  "/products/moderation/bulk",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("moderation:write"),
  bulkModerateProducts,
);

router.post(
  "/products/moderation/reset-status",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("moderation:write"),
  resetModerationStatus,
);

router.get(
  "/products/moderation/stats",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("moderation:read"),
  getModerationStats,
);

router.get(
  "/products/moderation/shops",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("moderation:read"),
  listModerationShops,
);

router.get(
  "/products/:id/moderation-detail",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("moderation:read"),
  getProductModerationDetailHandler,
);

router.get(
  "/products/:id/moderation-events",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("moderation:read"),
  getProductModerationEvents,
);

router.get(
  "/shop-risk",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("governance:read"),
  listShopRisk,
);

router.get(
  "/governance/dashboard",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("platform:read"),
  getGovernanceDashboard,
);

router.get(
  "/governance/health",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("platform:read"),
  getGovernanceHealth,
);

router.get(
  "/shops/:id/governance",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("governance:read"),
  getShopGovernance,
);

router.post(
  "/shops/:id/governance/actions",
  requireModerationEnabled,
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("governance:write"),
  postShopGovernanceAction,
);

// Step 3 — Platform-enabled gate for all future routes (Slice 3+).
// router.use without a path catches all requests not already handled above.
// This does NOT affect /features registered in Step 1.
// NOTE: /audit-log is registered above so Slice 2 Audit UI can work even when
// platformEnabled is false in ENV (frontend-only rollout safety).
if (!adminPlatformConfig.platformEnabled) {
  router.use((req, res) =>
    res.status(404).json({ error: "not found" }),
  );
}

export default router;
