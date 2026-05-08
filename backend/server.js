import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

import authRoutes from "./routes/auth.routes.js";
import shopRoutes from "./routes/shop.routes.js";
import productRoutes from "./routes/product.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import addressRoutes from "./routes/address.routes.js";
import carModelRoutes from "./routes/carModel.routes.js";
import productImportRoutes from "./routes/productImport.routes.js";
import productExportRoutes from "./routes/productExport.routes.js";
import carRoutes from "./routes/car.routes.js";
import filterRoutes from "./routes/filter.routes.js";
import locationRoutes from "./routes/location.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import productCategoryRoutes from "./routes/productCategory.routes.js";
import { getPopularCategories } from "./controllers/category.controller.js";
import productListRoutes from "./routes/productList.routes.js";
import { getProductList as getPublicProducts } from "./services/productList.service.js";
import seoRoutes from "./routes/seo.routes.js";
import seoPageApiRoutes from "./routes/seoPageApi.routes.js";
import categorySeoRoutes from "./routes/categorySeo.routes.js";
import { getProductDetail } from "./controllers/ProductDetail.controller.js";
import { requireAuth, requireShop, requireAdmin } from "./middlewares/auth.js";
import partKnowledgeRoutes from "./routes/partKnowledge.routes.js";
import knowledgePublicRoutes from "./routes/knowledgePublic.routes.js";
import {
  getShopProductFilterOptions,
  getProductsByShop,
} from "./controllers/product.controller.js";
import { normalizeListingQuery } from "./utils/listingQueryNormalize.js";
import vehicleSeoRoutes from "./routes/vehicleSeo.routes.js";

const app = express();

const defaultOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.1.10:3000",
  "http://192.168.0.1:3000",
];

const extraOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: [...new Set([...defaultOrigins, ...extraOrigins])],
    credentials: true,
  }),
);

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

/** Kiểm tra nhanh API có sống (dùng /health hoặc /api/health) */
const healthPayload = { ok: true, service: "otofine-api" };
app.get("/api/health", (req, res) => {
  res.json(healthPayload);
});
app.get("/health", (req, res) => {
  res.json(healthPayload);
});

app.get("/api/products", async (req, res) => {
  try {
    const result = await getPublicProducts(normalizeListingQuery(req.query));

    res.json(result);
  } catch (err) {
    console.error("PRODUCT API ERROR", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Part-knowledge SEO engine: `/api/seo-page/:slug` */
app.use("/api", seoPageApiRoutes);

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

/**
 * Meta lọc sản phẩm kho shop (hãng / loại xe / xuất xứ).
 * Path phẳng /api/shop-filters — luôn khớp, không phụ thuộc router lồng /api/shop/...
 */
app.get(
  "/api/shop-filters",
  requireAuth,
  requireShop,
  getShopProductFilterOptions,
);

app.use("/api/auth", authRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/shops", shopRoutes);

app.use("/api/knowledge", knowledgePublicRoutes);
app.use("/api/part-knowledge", partKnowledgeRoutes);
app.use("/api/admin", adminRoutes);
app.use(
  "/api/admin/part-knowledge",
  requireAuth,
  requireAdmin,
  partKnowledgeRoutes,
);
app.use("/api/address", addressRoutes);
app.use("/api/car-models", carModelRoutes);
app.use("/api/car", carRoutes);
app.use("/api/product-export", productExportRoutes);

app.use("/api/filter", filterRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/filter/categories", categoryRoutes);
app.use("/api/product-categories", productCategoryRoutes);
/** Cùng handler với GET /api/filter/categories/popular (slug ngắn theo yêu cầu tích hợp). */
app.get("/api/categories/popular", getPopularCategories);

/* Shop seller: đăng ký trực tiếp trên app để luôn khớp (tránh 404 khi merge nhiều router /api/products). */
app.get(
  "/api/products/shop/filters",
  requireAuth,
  requireShop,
  getShopProductFilterOptions,
);
app.get("/api/products/shop", requireAuth, requireShop, getProductsByShop);

// Trang chủ: /list, /brands, /models + import + CRUD shop
app.use("/api/products", productRoutes);
app.use("/api/products", productListRoutes);
app.use("/api/products", productImportRoutes);

app.get("/api/product/:id", getProductDetail);
app.use("/api/seo", seoRoutes);
app.use("/api/category-seo", categorySeoRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Otofine API đang chạy" });
});

app.use("/api", vehicleSeoRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server chạy port ${PORT}`);
});
