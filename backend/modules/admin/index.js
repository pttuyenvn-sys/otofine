/**
 * Admin platform module barrel.
 *
 * Re-exports platformRouter using `{ default as platformRouter }` — requires
 * platform.admin.routes.js to use `export default router` (B2 constraint).
 *
 * server.js consumes: import { platformRouter } from "./modules/admin/index.js"
 */

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
