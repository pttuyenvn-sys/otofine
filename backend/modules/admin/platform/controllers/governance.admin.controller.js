import { getGovernanceDashboardCached } from "../../../../modules/governance/services/governanceDashboard.service.js";
import { getGovernanceHealthSnapshot } from "../../../../modules/governance/services/governanceHealth.service.js";

/**
 * GET /api/admin/platform/governance/dashboard
 * Read-only aggregated dashboard (cached, no inline risk evaluation).
 */
export async function getGovernanceDashboard(req, res) {
  try {
    const payload = await getGovernanceDashboardCached();
    return res.json(payload);
  } catch (err) {
    console.error("[admin:governance] getGovernanceDashboard error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/platform/governance/health
 * Operational health snapshot for governance worker + cache + queries.
 */
export async function getGovernanceHealth(req, res) {
  try {
    const health = await getGovernanceHealthSnapshot();
    return res.json(health);
  } catch (err) {
    console.error("[admin:governance] getGovernanceHealth error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
