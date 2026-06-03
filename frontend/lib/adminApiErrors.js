/**
 * Map admin API failures to explicit operator-facing messages.
 * Avoids silent empty states when backend routes or flags are unavailable.
 */

const MODULE_MESSAGES = {
  "risk-flags":
    "Risk flags are not available. Enable ADMIN_MODERATION_ENABLED and ADMIN_RISK_ENGINE_ENABLED on the backend.",
  enforcement:
    "Enforcement API is not available. Enable ADMIN_MODERATION_ENABLED on the backend.",
  moderation:
    "Product moderation is not enabled. Enable ADMIN_MODERATION_ENABLED on the backend.",
  governance:
    "Governance dashboard is not available. Enable ADMIN_MODERATION_ENABLED on the backend.",
  "governance-health":
    "Governance health metrics are unavailable. The dashboard may be partially stale.",
  "shop-governance":
    "Shop governance is not available. Enable ADMIN_MODERATION_ENABLED on the backend.",
  "shop-risk":
    "Shop risk scores are not available. Enable ADMIN_MODERATION_ENABLED on the backend.",
  sessions:
    "Sessions governance is not available. Enable ADMIN_SESSION_GOVERNANCE_ENABLED on the backend.",
  audit:
    "Audit log endpoint is not available. Verify platform deployment and ADMIN_AUDIT_LOG_ENABLED if writes are expected.",
};

/**
 * @param {unknown} err
 * @param {{ module?: keyof typeof MODULE_MESSAGES, permissionDenied?: string }} [context]
 */
export function formatAdminApiError(err, context = {}) {
  const status = err?.response?.status;
  const body = err?.response?.data;
  const msg =
    (typeof body?.error === "string" && body.error) ||
    (typeof body?.message === "string" && body.message) ||
    (err instanceof Error ? err.message : "") ||
    "Request failed";

  if (status === 404 && context.module && MODULE_MESSAGES[context.module]) {
    return MODULE_MESSAGES[context.module];
  }

  if (status === 403) {
    return (
      context.permissionDenied ||
      "You do not have permission to access this admin resource."
    );
  }

  if (status === 404) {
    return `Admin endpoint is not available (404). ${msg}`;
  }

  return msg;
}
