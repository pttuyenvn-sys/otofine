/**
 * Admin platform routes.
 *
 * Route registration order is mandatory (design §6.2 + B1 constraint):
 *   1. /features registered UNCONDITIONALLY before any gate
 *   2. Platform-enabled catch-all gate for all FUTURE routes (Slice 3+)
 *
 * This file uses `export default router` — required by admin/index.js barrel
 * which uses `export { default as platformRouter }`.
 *
 * B1 patch: router.use(handler) without path — Express 5 / path-to-regexp@8
 * does not accept bare '*' as a wildcard. router.use(handler) correctly
 * catches all requests not already matched by registered routes above it.
 */

import express from "express";
import { requireAuth, requireAdmin } from "../../../../middlewares/auth.js";
import { getFeatures } from "../controllers/platform.admin.controller.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";

const router = express.Router();

// Step 1 — /features is ALWAYS registered, regardless of platformEnabled state.
// This must remain the FIRST route registration in this file.
router.get("/features", requireAuth, requireAdmin, getFeatures);

// Step 2 — Platform-enabled gate for all future routes (Slice 3+).
// router.use without a path catches all requests not already handled above.
// This does NOT affect /features registered in Step 1.
if (!adminPlatformConfig.platformEnabled) {
  router.use((req, res) =>
    res.status(404).json({ error: "not found" }),
  );
}

// Step 3 — Future gated routes go here (Slice 3+, not in Slice 2).

export default router;
