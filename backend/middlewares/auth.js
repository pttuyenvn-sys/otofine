/**
 * Backward-compatible shim — implementation lives in domains/auth.
 */
export {
  requireAuth,
  requireAdmin,
  requireShop,
} from "../domains/auth/middlewares/auth.middleware.js";
