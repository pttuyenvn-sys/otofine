import express from "express";
import {
  shopLogin,
  registerShop,
  adminLogin,
  adminForgotPassword,
} from "../controllers/authController.js";

import {
  getAllShops,
  getShopDetail,
  updateShopStatus,
  deleteShop,
} from "../controllers/adminController.js";

import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const router = express.Router();

/* ===== SHOP AUTH ===== */
router.post("/shop-login", shopLogin);
router.post("/shop-register", registerShop);

/* ===== ADMIN AUTH ===== */
router.post("/admin-login", adminLogin);
router.post("/admin-forgot-password", adminForgotPassword);

/* ===== ADMIN SHOP MANAGEMENT ===== */
router.get("/shops", requireAuth, requireAdmin, getAllShops);
router.get("/shops/:id/detail", requireAuth, requireAdmin, getShopDetail);
router.patch("/shops/:id/status", requireAuth, requireAdmin, updateShopStatus);
router.delete("/shops/:id", requireAuth, requireAdmin, deleteShop);

export default router;
