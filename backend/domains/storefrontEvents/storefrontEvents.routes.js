import express from "express";
import { handleTrackStorefrontEvent } from "./storefrontEvents.controller.js";

/**
 * Public storefront analytics ingest router.
 *
 * Mounted at `/api/storefront-events` in `server.js`. The single
 * endpoint accepts beacon-style POSTs from the storefront client
 * (via `frontend/components/shopsite/StorefrontAnalyticsForwarder`
 * which subscribes to the existing `window` "shopsite:event" bus).
 *
 * Auth: NONE. Public buyers fire these events. The controller
 * resolves the slug at write-time and enforces a per-IP rate cap.
 *
 * The router intentionally exposes ONE verb so a future maintainer
 * cannot accidentally turn this into a read-write endpoint.
 */
const router = express.Router();

router.post("/track", handleTrackStorefrontEvent);

export default router;
