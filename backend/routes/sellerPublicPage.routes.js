import express from "express";
import multer from "multer";
import { requireAuth, requireShop } from "../middlewares/auth.js";
import {
  publicShopsiteEnabledOrNotFound,
  publicPageUploadRateLimit,
  handleGetMyPublicPage,
  handleUpdateMyPublicPage,
  handleCheckSlug,
  handleUploadAvatar,
  handleUploadCover,
} from "../domains/shopPublic/index.js";

/**
 * Seller (owner) endpoints for the public storefront page.
 *
 * Mounted at /api/shop/public-page (gated by PUBLIC_SHOPSITE_ENABLED).
 *
 * Security stack: enabled-gate → requireAuth → requireShop → handler.
 * Image uploads add an in-memory rate limiter (12 / min / shop) and a
 * multer guard for size + count.
 */

const router = express.Router();

router.use(publicShopsiteEnabledOrNotFound);
router.use(requireAuth);
router.use(requireShop);

const memStorage = multer.memoryStorage();
const uploadOne = multer({
  storage: memStorage,
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
});

router.get("/", handleGetMyPublicPage);
router.put("/", handleUpdateMyPublicPage);
router.get("/check-slug", handleCheckSlug);

router.post(
  "/upload-avatar",
  publicPageUploadRateLimit,
  uploadOne.single("file"),
  handleUploadAvatar,
);

router.post(
  "/upload-cover",
  publicPageUploadRateLimit,
  uploadOne.single("file"),
  handleUploadCover,
);

export default router;
