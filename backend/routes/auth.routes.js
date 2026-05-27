import express from "express";
import {
  shopLogin,
  registerShop,
  adminLogin,
  adminForgotPassword,
  shopForgotPassword,
  shopResetPassword,
  changePassword,
  shopRefreshToken,
  shopLogout,
  // Slice 5: admin session governance
  adminRefresh,
  adminLogout,
} from "../controllers/authController.js";
import {
  requireAuth,
  requireShop,
} from "../middlewares/auth.js";
import {
  shopLoginRateLimit,
  shopRegisterRateLimit,
  shopForgotRateLimit,
} from "../domains/auth/middlewares/loginRateLimit.middleware.js";

const router = express.Router();

/* ================= SHOP AUTH ================= */
router.post("/shop-login", shopLoginRateLimit, shopLogin);
router.post("/shop-register", shopRegisterRateLimit, registerShop);
router.post("/shop-forgot-password", shopForgotRateLimit, shopForgotPassword);
router.post("/shop-reset-password", shopForgotRateLimit, shopResetPassword);
router.post(
  "/change-password",
  requireAuth,
  requireShop,
  shopLoginRateLimit,
  changePassword,
);
router.post("/shop-refresh", shopRefreshToken);
router.post("/shop-logout", shopLogout);

/* ================= ADMIN AUTH ================= */
router.post("/admin-login", shopLoginRateLimit, adminLogin);
router.post("/admin-forgot-password", shopForgotRateLimit, adminForgotPassword);
// Slice 5: session governance endpoints (additive)
router.post("/admin-refresh", shopLoginRateLimit, adminRefresh);
router.post("/admin-logout", requireAuth, adminLogout);

export default router;
