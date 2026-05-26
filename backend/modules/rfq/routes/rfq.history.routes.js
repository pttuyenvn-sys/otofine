import express from "express";
import { rfqLimits } from "../../../config/rfq.config.js";
import * as ctrl from "../controllers/rfq.history.controller.js";
import { rfqHistoryAuth } from "../middlewares/rfqHistory.middleware.js";
import { rfqRateLimit } from "../middlewares/rfqRateLimit.middleware.js";
import { rfqClientIp } from "../utils/rfqNet.js";

const router = express.Router();

router.post(
  "/request-otp",
  rfqRateLimit({
    windowMs: 3600_000,
    max: rfqLimits.historyOtpRequestPerIpHour,
    bucketPrefix: "rfq_history_otp_req",
  }),
  ctrl.rfqHistoryRequestOtp,
);

router.post(
  "/verify-otp",
  rfqRateLimit({
    windowMs: 3600_000,
    max: rfqLimits.historyOtpVerifyPerIpHour,
    bucketPrefix: "rfq_history_otp_verify",
  }),
  ctrl.rfqHistoryVerifyOtp,
);

router.get(
  "/summary",
  rfqRateLimit({
    windowMs: 60_000,
    max: rfqLimits.historyReadPerSessionMinute,
    bucketPrefix: "rfq_history_summary",
    keyFn: (req) => req.headers["x-rfq-history-token"] || rfqClientIp(req),
  }),
  rfqHistoryAuth,
  ctrl.rfqHistorySummary,
);

router.get(
  "/requests",
  rfqRateLimit({
    windowMs: 60_000,
    max: rfqLimits.historyReadPerSessionMinute,
    bucketPrefix: "rfq_history_list",
    keyFn: (req) => req.headers["x-rfq-history-token"] || rfqClientIp(req),
  }),
  rfqHistoryAuth,
  ctrl.rfqHistoryListRequests,
);

router.get(
  "/requests/:publicId",
  rfqRateLimit({
    windowMs: 60_000,
    max: rfqLimits.historyReadPerSessionMinute,
    bucketPrefix: "rfq_history_detail",
    keyFn: (req) => req.headers["x-rfq-history-token"] || rfqClientIp(req),
  }),
  rfqHistoryAuth,
  ctrl.rfqHistoryGetRequest,
);

router.post(
  "/requests/:publicId/open",
  rfqRateLimit({
    windowMs: 60_000,
    max: rfqLimits.historyReadPerSessionMinute,
    bucketPrefix: "rfq_history_open",
    keyFn: (req) => req.headers["x-rfq-history-token"] || rfqClientIp(req),
  }),
  rfqHistoryAuth,
  ctrl.rfqHistoryOpenRequest,
);

router.post("/logout", rfqHistoryAuth, ctrl.rfqHistoryLogout);

export default router;
