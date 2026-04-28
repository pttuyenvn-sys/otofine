// routes/product.routes.js
import express from "express";
import { requireAuth, requireShop } from "../middlewares/auth.js";
import {
  addProduct,
  getProductsByShop,
  updateProduct,
  deleteProduct,
  deleteProducts,
  importImages,
} from "../controllers/product.controller.js";
import { getProductCars } from "../controllers/product.controller.js";
import { filterProducts } from "../controllers/product.controller.js";
import { uploadProductMemory } from "../middlewares/upload.js";

const router = express.Router();

/* GET /shop và /shop/filters khai báo trong server.js (trước merge router) */

router.get("/", requireAuth, requireShop, getProductsByShop);

router.post(
  "/",
  requireAuth,
  requireShop,
  uploadProductMemory.array("images", 8),
  addProduct,
);

router.post(
  "/import-images",
  requireAuth,
  requireShop,
  uploadProductMemory.array("images", 1000),
  importImages,
);

router.put(
  "/:id",
  requireAuth,
  requireShop,
  uploadProductMemory.array("images", 8),
  updateProduct,
);

router.get("/filter", requireAuth, requireShop, filterProducts);

router.get("/car-info/:productId", getProductCars);

router.delete("/:id", requireAuth, requireShop, deleteProduct);

router.delete("/", requireAuth, requireShop, deleteProducts);

router.get("/:id/cars", requireAuth, requireShop, getProductCars);

export default router;
