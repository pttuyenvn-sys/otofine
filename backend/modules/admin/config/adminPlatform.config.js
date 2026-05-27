/**
 * Admin platform startup configuration.
 *
 * Read-only frozen object built from process.env at module load time.
 * server.js loads dotenv/config before this module is evaluated — process.env
 * is fully populated when this module runs.
 *
 * Change to any value requires a PM2 restart.
 * ENV values are never written to Redis (C1: only DB-resolved values are cached).
 */

/**
 * Redis TTL for feature flag cache entries.
 * Unit: milliseconds (setRaw accepts ms — see redisCache.service.js §3.5).
 * Using a named constant prevents the literal-60 bug (1-second TTL).
 */
export const FLAG_CACHE_TTL_MS = 60_000;

/**
 * Map from DB flag_key (uppercase ENV format) to camelCase config property.
 * This is the single source of truth for the key mapping.
 * Any new flag must be added here AND in the DB seed migration.
 * The camelCase values must match DEFAULT_FLAGS keys in AdminPlatformContext.js.
 */
export const FLAG_KEY_MAP = {
  ADMIN_PLATFORM_ENABLED:                 "platformEnabled",
  ADMIN_RBAC_ENABLED:                     "rbacEnabled",
  ADMIN_AUDIT_LOG_ENABLED:                "auditLogEnabled",
  ADMIN_MODERATION_ENABLED:               "moderationEnabled",
  ADMIN_BILLING_ENABLED:                  "billingEnabled",
  ADMIN_ANALYTICS_ENABLED:               "analyticsEnabled",
  ADMIN_RISK_ENGINE_ENABLED:              "riskEngineEnabled",
  ADMIN_SELLER_CRM_ENABLED:               "sellerCrmEnabled",
  ADMIN_PAYMENTS_ENABLED:                 "paymentsEnabled",
  ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED: "subscriptionEnforcementEnabled",
  // Slice 5: Admin Session Governance
  ADMIN_SESSION_GOVERNANCE_ENABLED:       "sessionGovernanceEnabled",
};

/**
 * Array of all managed flag keys in DB format.
 * Used for bulk SELECT queries and cache warming.
 * Cannot be empty — derived from FLAG_KEY_MAP which has 10 static entries.
 */
export const ALL_FLAG_KEYS = Object.keys(FLAG_KEY_MAP);

/**
 * Frozen ENV-based config object.
 * Properties use camelCase matching FLAG_KEY_MAP values.
 * All values default to false unless the ENV var is explicitly set to 'true'.
 * Changing a value requires PM2 restart (read once at module load time).
 */
export const adminPlatformConfig = Object.freeze({
  platformEnabled:              process.env.ADMIN_PLATFORM_ENABLED === "true",
  rbacEnabled:                  process.env.ADMIN_RBAC_ENABLED === "true",
  auditLogEnabled:              process.env.ADMIN_AUDIT_LOG_ENABLED === "true",
  moderationEnabled:            process.env.ADMIN_MODERATION_ENABLED === "true",
  billingEnabled:               process.env.ADMIN_BILLING_ENABLED === "true",
  analyticsEnabled:             process.env.ADMIN_ANALYTICS_ENABLED === "true",
  riskEngineEnabled:            process.env.ADMIN_RISK_ENGINE_ENABLED === "true",
  sellerCrmEnabled:             process.env.ADMIN_SELLER_CRM_ENABLED === "true",
  paymentsEnabled:              process.env.ADMIN_PAYMENTS_ENABLED === "true",
  subscriptionEnforcementEnabled: process.env.ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED === "true",
  // Slice 5: Admin Session Governance (ENV fallback — never cached in Redis)
  sessionGovernanceEnabled:     process.env.ADMIN_SESSION_GOVERNANCE_ENABLED === "true",
});
