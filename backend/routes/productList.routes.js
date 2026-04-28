import express from "express";
import {
  getProductList,
  getBrands,
  getModels,
} from "../controllers/productList.controller.js";
import { getProductCardList } from "../controllers/productCard.controller.js";
import { getProductSearch } from "../controllers/productSearch.controller.js";
import { getRelatedProducts } from "../controllers/productRelated.controller.js";

const router = express.Router();

router.get("/search", getProductSearch);
router.get("/related", getRelatedProducts);
router.get("/card-list", getProductCardList);
router.get("/list", getProductList);
router.get("/brands", getBrands);
router.get("/models", getModels);

export default router;
