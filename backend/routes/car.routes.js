import express from "express";
import {
  getBrands,
  getModelsByBrand,
  getCarAttributes, // 🔥 thêm dòng này
} from "../controllers/car.controller.js";

const router = express.Router();

router.get("/brands", getBrands);
router.get("/models", getModelsByBrand);

router.get("/attributes", getCarAttributes);

export default router;
