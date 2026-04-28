import express from "express";
import {
  getCategories,
  getPopularCategories,
} from "../controllers/category.controller.js";

const router = express.Router();

router.get("/popular", getPopularCategories);
router.get("/", getCategories);

export default router;
