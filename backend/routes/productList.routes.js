import express from "express";
import {
  getProductList,
  getBrands,
  getModels,
  getLocations,
} from "../controllers/productList.controller.js";

import { getProductCardList } from "../controllers/productCard.controller.js";
import { getProductSearch } from "../controllers/productSearch.controller.js";
import { getRelatedProducts } from "../controllers/productRelated.controller.js";

const router = express.Router();

router.get("/search", getProductSearch);
router.get("/related", getRelatedProducts);
router.get("/card-list", getProductCardList);

router.get("/brands", getBrands);
router.get("/models", getModels);
router.get("/locations", getLocations);

router.get("/", getProductList);

export default router;