/**
 * Admin platform controller — read-only feature flag state endpoint.
 *
 * GET /api/admin/platform/features
 * Auth: requireAuth + requireAdmin (admin JWT only)
 * Returns: camelCase flag key → boolean for all 10 managed flags.
 */

import { getAllFlagStates } from "../../core/featureFlags/featureFlag.service.js";

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getFeatures(req, res) {
  try {
    const flags = await getAllFlagStates();
    return res.json(flags);
  } catch (err) {
    console.error("[admin:platform] getFeatures error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
