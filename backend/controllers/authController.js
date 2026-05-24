/**
 * Backward-compatible shim — implementation lives in domains/auth.
 */
export {
  registerShop,
  shopLogin,
  shopForgotPassword,
  shopResetPassword,
  shopRefreshToken,
  shopLogout,
  adminLogin,
  adminForgotPassword,
} from "../domains/auth/index.js";
