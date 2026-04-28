import express from "express";
import {
  getCategorySeoContent,
  getCategoriesWithCounts,
  getRelatedCategories,
  getCategoryFAQ,
  getCategoryMetadata
} from "../controllers/categorySeo.controller.js";

const router = express.Router();

/**
 * GET /category-seo/categories
 * Get all categories with product counts and metadata
 */
router.get("/categories", getCategoriesWithCounts);

/**
 * GET /category-seo/:category
 * Get category SEO content with products
 */
router.get("/:category", getCategorySeoContent);

/**
 * GET /category-seo/:category/metadata
 * Get category metadata for SEO
 */
router.get("/:category/metadata", getCategoryMetadata);

/**
 * GET /category-seo/:category/related
 * Get related categories for a given category
 */
router.get("/:category/related", getRelatedCategories);

/**
 * GET /category-seo/:category/faq
 * Get category-specific FAQ data
 */
router.get("/:category/faq", getCategoryFAQ);

export default router;
