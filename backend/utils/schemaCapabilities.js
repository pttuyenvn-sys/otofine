import { pool } from "../config/db.js";

const TTL_MS = 5 * 60 * 1000;

/** @type {Readonly<SchemaCapabilities> | null} */
let cache = null;
/** @type {number} */
let cacheExpiresAt = 0;

/**
 * @typedef {Object} SchemaCapabilities
 * @property {boolean} hasShopRiskScores
 * @property {boolean} hasStorefrontEvents
 * @property {boolean} hasSellerDeletedAt
 * @property {boolean} hasProductGovernance
 * @property {boolean} hasModerationTimeline
 * @property {boolean} hasShopSlugHistory
 * @property {boolean} hasAdminAuditLog
 * @property {boolean} hasAdminEnforcement
 * @property {boolean} hasAdminShopSuspensions
 * @property {boolean} hasAdminModerationNotes
 */

/** @type {Readonly<SchemaCapabilities>} */
const DEFAULT_CAPABILITIES = Object.freeze({
  hasShopRiskScores: false,
  hasStorefrontEvents: false,
  hasSellerDeletedAt: false,
  hasProductGovernance: false,
  hasModerationTimeline: false,
  hasShopSlugHistory: false,
  hasAdminAuditLog: false,
  hasAdminEnforcement: false,
  hasAdminShopSuspensions: false,
  hasAdminModerationNotes: false,
});

async function probeSchemaCapabilities() {
  try {
    const [tableRows] = await pool.query(
      `
        SELECT TABLE_NAME AS tableName
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN (
            'shop_risk_scores',
            'shop_storefront_events',
            'product_moderation_events',
            'shop_slug_history',
            'admin_audit_log',
            'admin_enforcement_cases',
            'admin_shop_suspensions',
            'admin_moderation_notes'
          )
      `,
    );
    const tables = new Set((tableRows || []).map((r) => String(r.tableName)));

    const [columnRows] = await pool.query(
      `
        SELECT COLUMN_NAME AS columnName
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'products'
          AND COLUMN_NAME IN ('seller_deleted_at', 'moderation_status')
      `,
    );
    const columns = new Set((columnRows || []).map((r) => String(r.columnName)));

    return Object.freeze({
      hasShopRiskScores: tables.has("shop_risk_scores"),
      hasStorefrontEvents: tables.has("shop_storefront_events"),
      hasSellerDeletedAt: columns.has("seller_deleted_at"),
      hasProductGovernance: columns.has("moderation_status"),
      hasModerationTimeline: tables.has("product_moderation_events"),
      hasShopSlugHistory: tables.has("shop_slug_history"),
      hasAdminAuditLog: tables.has("admin_audit_log"),
      hasAdminEnforcement: tables.has("admin_enforcement_cases"),
      hasAdminShopSuspensions: tables.has("admin_shop_suspensions"),
      hasAdminModerationNotes: tables.has("admin_moderation_notes"),
    });
  } catch (err) {
    console.error(
      "[schema-capabilities] probe failed — using safe defaults:",
      err?.message || String(err),
    );
    return DEFAULT_CAPABILITIES;
  }
}

function logCapabilitiesInDev(caps) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[schema-capabilities]", caps);
}

/**
 * Cached schema capability flags (TTL ~5 minutes).
 * Never throws — returns safe false defaults on probe failure.
 *
 * @returns {Promise<Readonly<SchemaCapabilities>>}
 */
export async function getSchemaCapabilities() {
  const now = Date.now();
  if (cache && now < cacheExpiresAt) {
    return cache;
  }

  const caps = await probeSchemaCapabilities();
  cache = caps;
  cacheExpiresAt = now + TTL_MS;
  logCapabilitiesInDev(caps);
  return caps;
}

/** Clear cached capabilities (tests / post-migration hooks). */
export function invalidateSchemaCapabilities() {
  cache = null;
  cacheExpiresAt = 0;
}

export async function hasShopRiskScores() {
  return (await getSchemaCapabilities()).hasShopRiskScores;
}

export async function hasStorefrontEvents() {
  return (await getSchemaCapabilities()).hasStorefrontEvents;
}

export async function hasSellerDeletedAt() {
  return (await getSchemaCapabilities()).hasSellerDeletedAt;
}

export async function hasProductGovernance() {
  return (await getSchemaCapabilities()).hasProductGovernance;
}

export async function hasModerationTimeline() {
  return (await getSchemaCapabilities()).hasModerationTimeline;
}

/** @internal */
export function resetSchemaCapabilitiesCacheForTests() {
  invalidateSchemaCapabilities();
}
