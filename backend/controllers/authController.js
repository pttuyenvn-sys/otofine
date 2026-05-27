/**
 * Backward-compatible shim — implementation lives in domains/auth.
 */
export {
  registerShop,
  shopLogin,
  shopForgotPassword,
  shopResetPassword,
  changePassword,
  shopRefreshToken,
  shopLogout,
  adminLogin,
  adminForgotPassword,
  // Slice 5: admin session governance handlers
  adminRefresh,
  adminLogout,
} from "../domains/auth/index.js";
