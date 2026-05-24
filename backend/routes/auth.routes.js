import express from "express";
import {
  shopLogin,
  registerShop,
  adminLogin,
  adminForgotPassword,
  shopForgotPassword,
  shopResetPassword,
  shopRefreshToken,
  shopLogout,
} from "../controllers/authController.js";
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
router.post("/shop-refresh", shopRefreshToken);
router.post("/shop-logout", shopLogout);

/* ================= ADMIN AUTH ================= */
router.post("/admin-login", shopLoginRateLimit, adminLogin);
router.post("/admin-forgot-password", shopForgotRateLimit, adminForgotPassword);

export default router;
