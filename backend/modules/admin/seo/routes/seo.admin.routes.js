import express from "express";
import { requireAuth, requireAdmin } from "../../../../middlewares/auth.js";
import { requirePermission } from "../../core/rbac/rbac.middleware.js";
import { requireAdminSession } from "../../core/adminSession/adminSession.middleware.js";
import {
  exportImageCoverageCsvHandler,
  getImageCoverageHandler,
  getShopImageCoverageProductsHandler,
  validateImageCoverageHandler,
} from "../controllers/imageCoverage.admin.controller.js";

const router = express.Router();

const readGuards = [
  requireAuth,
  requireAdmin,
  requireAdminSession,
  requirePermission("platform:read"),
];

router.get("/image-coverage", ...readGuards, getImageCoverageHandler);
router.get("/image-coverage/validate", ...readGuards, validateImageCoverageHandler);
router.get("/image-coverage/export", ...readGuards, exportImageCoverageCsvHandler);
router.get(
  "/image-coverage/shops/:shopId/products",
  ...readGuards,
  getShopImageCoverageProductsHandler,
);

export default router;
