import express from "express";
import multer from "multer";
import { requireAuth, requireShop } from "../middlewares/auth.js";
import {
  publicShopsiteEnabledOrNotFound,
  publicPageUploadRateLimit,
  slugCheckRateLimit,
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
router.get("/check-slug", slugCheckRateLimit, handleCheckSlug);

/**
 * Multer error → JSON. Without this Express's default handler emits
 * a noisy HTML stacktrace which both leaks file paths and breaks the
 * frontend's `err.response.data.error` consumer.
 */
function uploadErrorHandler(err, req, res, next) {
  if (!err) return next();
  if (err && (err.name === "MulterError" || err.code === "LIMIT_FILE_SIZE")) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({
      ok: false,
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "Ảnh quá lớn. Tối đa 5MB."
          : "Upload không hợp lệ.",
      code: err.code,
    });
  }
  return next(err);
}

router.post(
  "/upload-avatar",
  publicPageUploadRateLimit,
  uploadOne.single("file"),
  uploadErrorHandler,
  handleUploadAvatar,
);

router.post(
  "/upload-cover",
  publicPageUploadRateLimit,
  uploadOne.single("file"),
  uploadErrorHandler,
  handleUploadCover,
);

// Route-level fallback for any multer error that escapes a single
// endpoint (e.g. unexpected field).
router.use(uploadErrorHandler);

export default router;
