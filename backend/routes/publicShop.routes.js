import express from "express";
import {
  publicShopsiteEnabledOrNotFound,
  handleGetShop,
  handleGetShopProducts,
  handleGetShopCategories,
  handleGetShopContact,
} from "../domains/shopPublic/index.js";

/**
 * Public shopsite read-only API.
 * Mounted in server.js at `/api/public/shops` and ONLY when the flag
 * is enabled at boot. The middleware below is a second safety net.
 */
const router = express.Router();

router.use(publicShopsiteEnabledOrNotFound);

router.get("/:slug", handleGetShop);
router.get("/:slug/products", handleGetShopProducts);
router.get("/:slug/categories", handleGetShopCategories);
router.get("/:slug/contact", handleGetShopContact);

export default router;
