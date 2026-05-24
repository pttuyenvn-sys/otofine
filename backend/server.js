// Load .env BEFORE any other module is evaluated. ESM hoists imports
// to the top of the file, so a separate `dotenv.config()` call would
// run AFTER every imported module had already read `process.env`.
import "dotenv/config";

import express from "express";
import cors from "cors";
import path from "path";
import axios from "axios";

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
import { mountRfqRoutes, rfqFlags } from "./modules/rfq/index.js";
import rfqAdminRoutes from "./modules/rfq/routes/rfq.admin.routes.js";
import rfqPushRoutes from "./routes/rfqPush.routes.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import pushRoutes from "./routes/push.routes.js";
app.use("/api/push", pushRoutes);

const defaultOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.1.10:3000",
  "http://192.168.0.1:3000",
  "http://180.93.1.24:3000",
  "http://180.93.1.24:3001",
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

/** Anonymous RFQ buyer — OneSignal subscription registration (no JWT) */
app.use("/api/rfq-push", rfqPushRoutes);

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

app.use("/api/admin/rfq", requireAuth, requireAdmin, rfqAdminRoutes);

mountRfqRoutes(app);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.info("[api] listening", {
    port: PORT,
    rfq_module: rfqFlags.RFQ_MODULE_ENABLED,
  });
});

app.get("/api/zalo/webhook", (req, res) => {
  res.json({ ok: true, type: "webhook" });
});



app.get("/api/zalo/oa/callback", async (req, res) => {
  try {
    const { code } = req.query;

    const response = await axios.post(
      "https://oauth.zaloapp.com/v4/oa/access_token",
      null,
      {
        params: {
          app_id: process.env.ZALO_OA_APP_ID,
          code,
          grant_type: "authorization_code",
        },
        headers: {
          secret_key: process.env.ZALO_OA_SECRET,
        },
      }
    );

    console.log("ZALO TOKEN:", response.data);

    res.json(response.data);

  } catch (err) {
    console.error(
      "ZALO TOKEN ERROR:",
      err?.response?.data || err.message
    );

    res.status(500).json({
      error: err?.response?.data || err.message,
    });
  }
});

app.get("/api/zalo/test-send", async (req, res) => {
  try {

    const axios = (await import("axios")).default;

    const response = await axios.post(
      "https://openapi.zalo.me/v3.0/oa/message/cs",
      {
        recipient: {
          user_id: "4106984553499884062"
        },
        message: {
          text: "Test OA Otofine hoạt động."
        }
      },
      {
        headers: {
          access_token: process.env.ZALO_OA_ACCESS_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);

  } catch (err) {

    console.error(
      err?.response?.data || err.message
    );

    res.status(500).json(
      err?.response?.data || {
        error: err.message
      }
    );
  }
});

app.post("/api/zalo/webhook", async (req, res) => {

  console.log(
    "ZALO WEBHOOK:",
    JSON.stringify(req.body, null, 2)
  );

  res.json({
    error: 0,
    message: "success"
  });
});