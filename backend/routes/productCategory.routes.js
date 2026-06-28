import express from "express";
import {
  getProductCategories,
  getCanonicalCategories,
  searchCategories,
  searchSidebarCategories,
  searchPreviewBatch,
  getProductCategoryBySlug,
} from "../controllers/productCategory.controller.js";

const router = express.Router();

// Get all active categories for frontend menu (variants for filters)
router.get("/", getProductCategories);

// Get canonical categories for menu (merged directional variants)
router.get("/canonical", getCanonicalCategories);

// Search categories for autocomplete
router.get("/search", searchCategories);

// Legacy — prefer GET /api/search/suggest (SEARCH-SINGLE-ENDPOINT-01)
router.get("/search-sidebar", searchSidebarCategories);

// Legacy — prefer GET /api/search/suggest
router.get("/search-preview-batch", searchPreviewBatch);

// Get single category by slug
router.get("/slug/:slug", getProductCategoryBySlug);

export default router;
