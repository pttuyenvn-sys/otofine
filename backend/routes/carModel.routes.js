// routes/carModel.routes.js
import express from "express";
import { requireAuth } from "../middlewares/auth.js";
import { getBrands, getModels } from "../controllers/carModel.controller.js";

const router = express.Router();

// danh sách hãng xe
router.get("/brands", requireAuth, getBrands);

// danh sách xe (lọc theo hãng)
router.get("/", requireAuth, getModels);

export default router;
