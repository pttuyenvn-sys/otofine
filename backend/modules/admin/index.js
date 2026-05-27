/**
 * Admin platform module barrel.
 *
 * Re-exports platformRouter using `{ default as platformRouter }` — requires
 * platform.admin.routes.js to use `export default router` (B2 constraint).
 * Re-exports rbacRouter using `{ default as rbacRouter }` — requires
 * rbac.admin.routes.js to use `export default router` (same constraint).
 *
 * server.js consumes:
 *   import { platformRouter, rbacRouter } from "./modules/admin/index.js"
 */

// ── Slice 2: Platform routes and feature flag services ──────────────────────
export { default as platformRouter } from "./platform/routes/platform.admin.routes.js";
export {
  isFeatureEnabled,
  getAllFlagStates,
  invalidateFlagCache,
} from "./core/featureFlags/featureFlag.service.js";
export {
  adminPlatformConfig,
  FLAG_KEY_MAP,
  ALL_FLAG_KEYS,
  FLAG_CACHE_TTL_MS,
} from "./config/adminPlatform.config.js";

// ── Slice 3: RBAC routes and services ───────────────────────────────────────
export { default as rbacRouter } from "./rbac/routes/rbac.admin.routes.js";
export {
  getAdminRbac,
  hasPermission,
  invalidateAdminRbacCache,
  RBAC_CACHE_TTL_MS,
} from "./core/rbac/rbac.service.js";
export { requirePermission } from "./core/rbac/rbac.middleware.js";

// ── Slice 4: Audit Log service ───────────────────────────────────────────────
export { logAdminAction } from "./core/auditLog/auditLog.service.js";

// ── Slice 5: Admin Session Governance ────────────────────────────────────────
export { requireAdminSession } from "./core/adminSession/adminSession.middleware.js";

// ── Slice 6: Seller Enforcement & Moderation ─────────────────────────────────
// Named export — routes file uses `export const enforcementRouter = router;` (C9).
// server.js consumes: import { ..., enforcementRouter } from "./modules/admin/index.js"
export { enforcementRouter } from "./enforcement/routes/enforcement.admin.routes.js";
