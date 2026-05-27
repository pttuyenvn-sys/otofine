/**
 * Enforcement & Moderation admin routes — Slice 6.
 *
 * Startup gate semantics (B2):
 *   This is a DYNAMIC per-request async check against isFeatureEnabled().
 *   It is NOT the static ENV-only pattern used by Slice 3 (RBAC).
 *   Dynamic behavior allows DB flag activation to take effect within 60s
 *   (Redis TTL) without a PM2 restart. Slice 3's static gate would silently
 *   break the hidden deployment activation step (Step 6).
 *
 * Middleware execution order (C2):
 *   1. startup gate (router.use — fires FIRST for ALL routes on this router)
 *   2. requireAuth    (validates JWT, populates req.user)
 *   3. requireAdmin   (validates req.user.role === 'admin')
 *   4. requireAdminSession (pass-through when governance off; fail-closed when on)
 *   5. requirePermission  (pass-through when RBAC off; enforces when on)
 *   6. controller handler
 *
 *   Consequence: when ADMIN_MODERATION_ENABLED=false, ALL requests return 404
 *   before auth middleware runs — unauthenticated requests also get 404, not 401.
 *   This is expected behavior (confirmed by smoke test S1).
 *
 * Export style (C9):
 *   Named export `enforcementRouter` — NOT `export default router`.
 *   The barrel (modules/admin/index.js) uses:
 *     export { enforcementRouter } from "./enforcement/routes/enforcement.admin.routes.js"
 *   Both must match (named ↔ named).
 *
 * Auth import path (B1):
 *   "../../../../middlewares/auth.js" — the shim in backend/middlewares/auth.js
 *   re-exports from domains/auth/middlewares/auth.middleware.js.
 *   "../../../../middleware/auth.middleware.js" does NOT exist.
 *
 * Express 5 safe:
 *   router.use(async handler) with no path argument.
 *   router.use("*", handler) causes a startup crash in Express 5.
 */

import express from "express";
import { requireAuth, requireAdmin } from "../../../../middlewares/auth.js";
import {
  requireAdminSession,
  requirePermission,
  isFeatureEnabled,
} from "../../index.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";
import * as controller from "../controllers/enforcement.admin.controller.js";

// ── Main enforcement router ─────────────────────────────────────────────────

const router = express.Router();

// ── Startup gate (MUST be registered BEFORE any named routes) ───────────────
// Dynamic: per-request Redis/DB check. Passes when ADMIN_MODERATION_ENABLED=true
// in either DB (via Redis cache) or ENV fallback. Fail-closed when both fail.
router.use(async (req, res, next) => {
  try {
    const enabled = await isFeatureEnabled("ADMIN_MODERATION_ENABLED");
    if (!enabled) return res.status(404).json({ error: "not found" });
    next();
  } catch {
    // Redis/DB failure — fall back to ENV value
    if (!adminPlatformConfig.moderationEnabled) {
      return res.status(404).json({ error: "not found" });
    }
    next();
  }
});

// ── Case routes ─────────────────────────────────────────────────────────────

router.get(
  "/cases",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("moderation:read"),
  controller.listCases,
);

router.post(
  "/cases",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("moderation:write"),
  controller.openCase,
);

router.get(
  "/cases/:id",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("moderation:read"),
  controller.getCase,
);

// Handles status transitions (resolve, close, appeal, open←pending_review)
// and assignment (body: { assignTo: adminId } or { status, resolution, ... })
router.patch(
  "/cases/:id",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("moderation:write"),
  controller.updateCase,
);

// ── Suspension / reinstatement (double permission) ──────────────────────────
// requirePermission('shops:write') is the SECOND call — its value overwrites
// req.adminPermissionChecked = 'shops:write', which is recorded in
// admin_audit_log.permission_checked. This is the correct value to capture
// because shops:write authorises writing to production shops/shop_accounts columns.

router.post(
  "/cases/:id/suspend",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("moderation:write"),
  requirePermission("shops:write"),
  controller.suspendShop,
);

router.post(
  "/cases/:id/reinstate",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("moderation:write"),
  requirePermission("shops:write"),
  controller.reinstateShop,
);

// ── Termination (superadmin-only; no requirePermission — hard guard in service) ─

router.post(
  "/cases/:id/terminate",
  requireAuth, requireAdmin, requireAdminSession,
  controller.terminateShop,
);

// ── Moderation notes ─────────────────────────────────────────────────────────

router.get(
  "/cases/:id/notes",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("moderation:read"),
  controller.listNotes,
);

router.post(
  "/cases/:id/notes",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("moderation:write"),
  controller.createNote,
);

router.patch(
  "/notes/:id/pin",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("moderation:write"),
  controller.pinNote,
);

router.delete(
  "/notes/:id",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("moderation:write"),
  controller.deleteNote,
);

// ── Risk flag sub-router (requires ADMIN_MODERATION_ENABLED AND ADMIN_RISK_ENGINE_ENABLED) ─

const riskRouter = express.Router();

// Risk sub-router startup gate: ADMIN_RISK_ENGINE_ENABLED check.
// The outer enforcement startup gate (ADMIN_MODERATION_ENABLED) already fired
// for this request — both flags must be true for risk routes to be reachable.
riskRouter.use(async (req, res, next) => {
  try {
    const enabled = await isFeatureEnabled("ADMIN_RISK_ENGINE_ENABLED");
    if (!enabled) return res.status(404).json({ error: "not found" });
    next();
  } catch {
    if (!adminPlatformConfig.riskEngineEnabled) {
      return res.status(404).json({ error: "not found" });
    }
    next();
  }
});

riskRouter.get(
  "/",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("risk:read"),
  controller.listFlags,
);

riskRouter.post(
  "/",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("risk:write"),
  controller.createFlag,
);

riskRouter.patch(
  "/:id/review",
  requireAuth, requireAdmin, requireAdminSession,
  requirePermission("risk:write"),
  controller.reviewFlag,
);

// Mount risk sub-router under /risk-flags.
// Requests to /api/admin/enforcement/risk-flags/* go through:
//   outer enforcement gate → riskRouter gate → auth chain → handler
router.use("/risk-flags", riskRouter);

// ── Named export required by barrel (C9) ────────────────────────────────────
export const enforcementRouter = router;
