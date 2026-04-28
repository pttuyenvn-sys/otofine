// routes/productImport.routes.js
//Imporrt Excel
import express from "express";
import { requireAuth, requireShop } from "../middlewares/auth.js";
import { uploadExcel } from "../middlewares/uploadExcel.js";
import { importProducts } from "../controllers/productImport.controller.js";

const router = express.Router();

router.post(
  "/import",
  requireAuth,
  requireShop,
  uploadExcel.single("file"),
  importProducts,
);

//Imporrt Images
import { uploadImages } from "../middlewares/upload.js";
import { importProductImages } from "../controllers/productImport.controller.js";

router.post(
  "/images/import",
  requireAuth,
  requireShop,
  uploadImages.array("images", 200),
  importProductImages,
);

export default router;
