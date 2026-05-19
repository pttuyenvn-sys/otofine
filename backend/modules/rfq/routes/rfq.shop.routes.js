import express from "express";
import { rfqLimits } from "../../../config/rfq.config.js";
import { rfqRequireSeller } from "../middlewares/rfqSeller.middleware.js";
import { rfqTouchShopSeen } from "../middlewares/rfqTouchShopSeen.middleware.js";
import { rfqRateLimit } from "../middlewares/rfqRateLimit.middleware.js";
import * as ctrl from "../controllers/rfq.shop.controller.js";

const router = express.Router();

router.use(rfqRequireSeller);
router.use(rfqTouchShopSeen);

router.get("/inbox/summary", ctrl.rfqShopInboxSummary);
router.get("/inbox", ctrl.rfqShopInbox);

router.patch("/:dispatchId/view", ctrl.rfqShopMarkView);

router.post(
  "/:dispatchId/quote",
  rfqRateLimit({
    windowMs: 60_000,
    max: rfqLimits.shopQuotePerShopPerMinute,
    bucketPrefix: "rfq_shop_quote",
    keyFn: (req) => String(req.shop?.id ?? "anon"),
  }),
  ctrl.rfqShopQuote,
);

router.get("/:dispatchId", ctrl.rfqShopDetail);

export default router;
