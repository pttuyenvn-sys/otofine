import express from "express";
import {
  getBrands,
  getModels,
  getYears,
  getSpecs,
  getVehicleHotSuggestions,
} from "../controllers/filter.controller.js";

const router = express.Router();

router.get("/vehicle-hot", getVehicleHotSuggestions);
router.get("/brands", getBrands);
router.get("/models", getModels);
router.get("/years", getYears);
router.get("/specs", getSpecs);

export default router;
