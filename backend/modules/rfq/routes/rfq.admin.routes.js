import express from "express";
import { rfqFlags } from "../../../config/rfq.config.js";
import * as ctrl from "../controllers/rfq.admin.controller.js";

const router = express.Router();

router.use((req, res, next) => {
  if (!rfqFlags.RFQ_MODULE_ENABLED) return res.status(404).json({ message: "RFQ module disabled" });
  next();
});

router.get("/health", ctrl.rfqAdminHealth);
router.get("/metrics", ctrl.rfqAdminMetrics);

router.get("/analytics/funnel", ctrl.rfqAdminAnalyticsFunnel);
router.get("/analytics/sellers", ctrl.rfqAdminAnalyticsSellers);
router.get("/analytics/ux", ctrl.rfqAdminAnalyticsUx);

router.post("/ops/replay-escalation/:dispatchId", ctrl.rfqAdminOpsReplayEscalation);
router.post("/ops/dispatch-append/:rfqRequestId", ctrl.rfqAdminOpsDispatchAppend);
router.post("/ops/spam/:rfqRequestId", ctrl.rfqAdminOpsSpam);
router.post("/ops/close/:rfqRequestId", ctrl.rfqAdminOpsClose);
router.get("/ops/seller/:shopId/activity", ctrl.rfqAdminOpsSellerActivity);

export default router;
