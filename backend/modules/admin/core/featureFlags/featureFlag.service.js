/**
 * Feature flag resolution service.
 *
 * Resolution order per design §2.1:
 *   Layer 1: Redis cache (via redisCache.service.js)
 *   Layer 2: DB table admin_feature_flags
 *   Layer 3: ENV var via adminPlatformConfig (startup-time only)
 *   Layer 4: false (default for unknown keys)
 *
 * C1 constraint: ENV fallback values are NEVER written to Redis or in-memory LRU.
 * Only DB-resolved values populate the cache.
 *
 * C2 constraint: bulk invalidation uses prefix 'admin:ff:ADMIN_' (not 'admin:ff:').
 *
 * C3 constraint: getAllFlagStates includes a DB-only cache warming loop.
 *
 * R7 constraint: all setRaw calls use FLAG_CACHE_TTL_MS (60_000 ms), never literal 60.
 *
 * R5 constraint: mysql2 IN() queries use [cacheMisses] double-nested array.
 */

import { getRaw, setRaw, invalidateByLogicalPrefix } from "../../../../services/redisCache.service.js";
import { pool } from "../../../../config/db.js";
import {
  adminPlatformConfig,
  FLAG_KEY_MAP,
  ALL_FLAG_KEYS,
  FLAG_CACHE_TTL_MS,
} from "../../config/adminPlatform.config.js";

/**
 * Resolve a single feature flag.
 *
 * @param {string} flagKey  DB/ENV format key, e.g. 'ADMIN_RBAC_ENABLED'
 * @returns {Promise<boolean>}
 */
export async function isFeatureEnabled(flagKey) {
  // Layer 1: Redis / in-memory LRU cache
  const cached = await getRaw(`admin:ff:${flagKey}`);
  if (cached !== null) {
    return cached === "1";
  }

  // Layer 2: DB
  try {
    const [rows] = await pool.query(
      "SELECT is_enabled FROM admin_feature_flags WHERE flag_key = ?",
      [flagKey],
    );
    if (rows.length > 0) {
      const dbValue = Boolean(rows[0].is_enabled);
      // Cache DB-sourced value — C1: ENV fallback is NOT cached
      setRaw(`admin:ff:${flagKey}`, dbValue ? "1" : "0", FLAG_CACHE_TTL_MS).catch(() => {});
      return dbValue;
    }
  } catch (err) {
    console.warn(`[featureFlag] isFeatureEnabled DB error for "${flagKey}":`, err.message);
  }

  // Layer 3: ENV fallback — NOT written to cache (C1)
  const camelKey = FLAG_KEY_MAP[flagKey];
  return adminPlatformConfig[camelKey] ?? false;
}

/**
 * Resolve all 10 managed feature flags in a single bulk DB query.
 *
 * Cache warming: after the DB query, each DB-resolved value is written to Redis
 * so that subsequent isFeatureEnabled(key) calls return Redis hits (C3).
 * ENV fallback values are NOT cached (C1).
 *
 * @returns {Promise<Record<string, boolean>>} camelCase key → boolean
 */
export async function getAllFlagStates() {
  // Phase 1: check Redis/LRU for each key individually
  const cacheHits = new Map();
  const cacheMisses = [];

  for (const flagKey of ALL_FLAG_KEYS) {
    const cached = await getRaw(`admin:ff:${flagKey}`);
    if (cached !== null) {
      cacheHits.set(flagKey, cached === "1");
    } else {
      cacheMisses.push(flagKey);
    }
  }

  // Phase 2: bulk DB query for cache misses only
  const dbMap = new Map();
  if (cacheMisses.length > 0) {
    try {
      // R5: double-nested array for mysql2 IN() expansion
      // [cacheMisses] passes cacheMisses as the first param; mysql2 expands the array
      const [rows] = await pool.query(
        "SELECT flag_key, is_enabled FROM admin_feature_flags WHERE flag_key IN (?)",
        [cacheMisses],
      );
      for (const row of rows) {
        const dbValue = Boolean(row.is_enabled);
        dbMap.set(row.flag_key, dbValue);
        // C3: DB-only cache warming loop — write each DB-resolved value to Redis
        // C1: ENV fallback values are NOT included here — only rows returned by DB
        setRaw(`admin:ff:${row.flag_key}`, dbValue ? "1" : "0", FLAG_CACHE_TTL_MS).catch(
          () => {},
        );
      }
    } catch (err) {
      console.warn("[featureFlag] getAllFlagStates DB error:", err.message);
      // dbMap remains empty — all misses fall through to ENV fallback (not cached)
    }
  }

  // Phase 3: build result object for all 10 flags
  const result = {};
  for (const flagKey of ALL_FLAG_KEYS) {
    const camelKey = FLAG_KEY_MAP[flagKey];
    if (cacheHits.has(flagKey)) {
      result[camelKey] = cacheHits.get(flagKey);
    } else if (dbMap.has(flagKey)) {
      result[camelKey] = dbMap.get(flagKey);
    } else {
      // ENV fallback — NOT cached (C1)
      result[camelKey] = adminPlatformConfig[camelKey] ?? false;
    }
  }
  return result;
}

/**
 * Invalidate feature flag cache entries.
 *
 * C2: bulk prefix is 'admin:ff:ADMIN_' (not 'admin:ff:') to avoid
 * invalidating unrelated keys in the admin:ff: namespace.
 *
 * C1 patch: !flagKey guard handles null, undefined, and empty string —
 * all semantically equivalent to "invalidate all flags".
 *
 * @param {string|null} flagKey  null for all flags, or a specific DB key
 *                               e.g. 'ADMIN_RBAC_ENABLED'
 */
export async function invalidateFlagCache(flagKey) {
  if (!flagKey) {
    await invalidateByLogicalPrefix("admin:ff:ADMIN_");
  } else {
    await invalidateByLogicalPrefix(`admin:ff:${flagKey}`);
  }
}
