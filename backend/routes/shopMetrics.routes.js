import express from "express";
import { requireAuth, requireShop } from "../middlewares/auth.js";
import { handleGetShopMetricsOverview } from "../controllers/shopMetrics.controller.js";

/**
 * Seller dashboard metrics.
 *
 * Mounted in `server.js` at `/api/shop/metrics` so the auth-protected
 * routes here ship under a distinct prefix from the existing
 * `/api/shop` (which already has its own controllers). Keeping the
 * surface separated makes the router easy to feature-flag off later
 * without touching the legacy shop CRUD.
 *
 * Endpoint:
 *   GET /api/shop/metrics/overview  → ShopMetricsOverview payload
 */
const router = express.Router();

router.get("/overview", requireAuth, requireShop, handleGetShopMetricsOverview);

export default router;
