import express from "express";
import {
  shopLogin,
  registerShop,
  adminLogin,
  adminForgotPassword,
} from "../controllers/authController.js";

const router = express.Router();

/* ================= SHOP AUTH ================= */
router.post("/shop-login", shopLogin);
router.post("/shop-register", registerShop);

/* ================= ADMIN AUTH ================= */
router.post("/admin-login", adminLogin);
router.post("/admin-forgot-password", adminForgotPassword);

export default router;
