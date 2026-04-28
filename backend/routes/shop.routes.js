// routes/shop.routes.js
import express from "express";
import { requireAuth, requireShop } from "../middlewares/auth.js";
import { uploadShop } from "../middlewares/upload.js";
import {
  getMyShop,
  createShop,
  updateMyShop,
  uploadEditorImage,
} from "../controllers/shop.controller.js";

const router = express.Router();

// ✅ LẤY SHOP HIỆN TẠI
router.get("/me", requireAuth, requireShop, getMyShop);

// ✅ TẠO SHOP (nếu chưa có)
router.post(
  "/",
  requireAuth,
  uploadShop.fields([
    { name: "avatar", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  createShop
);

// ✅ CẬP NHẬT SHOP HIỆN TẠI
router.put(
  "/me",
  requireAuth,
  uploadShop.fields([
    { name: "avatar", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  updateMyShop
);

// ✅ UPLOAD ẢNH CHO EDITOR
router.post(
  "/upload-editor",
  requireAuth,
  requireShop,
  uploadShop.single("file"),
  uploadEditorImage
);

export default router;
