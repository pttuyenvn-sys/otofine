import express from "express";
import { rfqLimits } from "../../../config/rfq.config.js";
import {
  handleGetSuggestions,
  handlePostEvent,
} from "../controllers/rfq.assist.controller.js";
import { rfqViewerAuth } from "../middlewares/rfqViewer.middleware.js";
import { rfqRateLimit } from "../middlewares/rfqRateLimit.middleware.js";

/**
 * Phase 8.2 — RFQ Assist routes.
 *
 * Two endpoints, both viewer-auth gated (reuses the same
 * `X-RFQ-Viewer-Token` header used by `/api/rfq/by-token`):
 *
 *   GET  /api/rfq/assist/suggestions
 *     → returns top-N supplier suggestions for the auth'd RFQ
 *     → reads rollout from env at request time (hot-flip safe)
 *     → never caches at proxy (Cache-Control: private, no-store)
 *
 *   POST /api/rfq/assist/events
 *     → records {impression|click|selected|deselected|dismissed}
 *     → soft-capped to 200 events per RFQ at the repo layer
 *     → always returns 200 unless action is invalid (then 400)
 *
 * Rate limits live alongside the existing `/by-token` limits in
 * `rfq.config.js`. Defaults are intentionally generous — the panel
 * only renders for a small slice of RFQs during soft rollout.
 */

const router = express.Router();

router.get(
  "/suggestions",
  rfqRateLimit({
    windowMs: 60_000,
    max: rfqLimits.assistSuggestionsPerMinute,
    bucketPrefix: "rfq_assist_suggest",
  }),
  rfqViewerAuth,
  handleGetSuggestions,
);

router.post(
  "/events",
  rfqRateLimit({
    windowMs: 60_000,
    max: rfqLimits.assistEventsPerMinute,
    bucketPrefix: "rfq_assist_event",
  }),
  rfqViewerAuth,
  express.json({ limit: "8kb" }),
  handlePostEvent,
);

export default router;
