import express from "express";
import { requireAuth, requireShop } from "../middlewares/auth.js";
import { exportProducts } from "../controllers/productExport.controller.js";

const router = express.Router();

router.get("/export", requireAuth, requireShop, exportProducts);

export default router;
