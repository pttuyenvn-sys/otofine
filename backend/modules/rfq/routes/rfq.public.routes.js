import express from "express";
import { rfqLimits } from "../../../config/rfq.config.js";
import * as ctrl from "../controllers/rfq.public.controller.js";
import { rfqViewerAuth } from "../middlewares/rfqViewer.middleware.js";
import { rfqRateLimit } from "../middlewares/rfqRateLimit.middleware.js";
import { rfqMulterSingle } from "../middlewares/rfqMulter.middleware.js";

const router = express.Router();

router.post(
  "/create",
  rfqRateLimit({
    windowMs: 3600_000,
    max: rfqLimits.createPerIpPerHour,
    bucketPrefix: "rfq_create",
  }),
  ctrl.rfqCreate,
);

router.post(
  "/verify-otp",
  rfqRateLimit({
    windowMs: 3600_000,
    max: rfqLimits.otpVerifyPerIpPerHour,
    bucketPrefix: "rfq_otp",
  }),
  ctrl.rfqVerifyOtp,
);

router.get(
  "/by-token",
  rfqRateLimit({
    windowMs: 60_000,
    max: rfqLimits.viewerByTokenPerIpMinute,
    bucketPrefix: "rfq_viewer_token",
  }),
  rfqViewerAuth,
  ctrl.rfqGetByToken,
);

router.post(
  "/upload-image",
  rfqRateLimit({
    windowMs: 3600_000,
    max: 60,
    bucketPrefix: "rfq_upload",
  }),
  rfqMulterSingle("file"),
  ctrl.rfqUploadImage,
);

export default router;
