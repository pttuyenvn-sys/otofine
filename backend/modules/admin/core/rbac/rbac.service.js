/**
 * RBAC permission resolution service.
 *
 * Provides:
 *   getAdminRbac(adminId)         — resolves an admin's roles + permissions from Redis/DB
 *   hasPermission(adminId, key)   — returns true if admin has the given permission (or is superadmin)
 *   invalidateAdminRbacCache(id)  — invalidates per-admin or all RBAC cache entries
 *
 * Cache strategy:
 *   Key:    admin:rbac:{adminId}:perms
 *   TTL:    RBAC_CACHE_TTL_MS (300 000 ms = 5 minutes)
 *   Value:  JSON string: { "permissions": ["rbac:read", ...], "isSuperadmin": false }
 *
 * Cache key format (with redisCache.service.js namespace prefix applied):
 *   {CACHE_KEY_PREFIX}dv{CACHE_DATA_VERSION}:admin:rbac:{adminId}:perms
 *   Example: otofine:v1:dv1:admin:rbac:7:perms
 *
 * Per-admin invalidation prefix: 'admin:rbac:' + adminId + ':'
 *   Colon-terminated — prevents numeric prefix collision (B2).
 *   'admin:rbac:7:' does NOT match 'admin:rbac:70:perms'.
 *
 * Fail-safe behavior (C1 final-review):
 *   When DB is unavailable, getAdminRbac catches the error internally and returns
 *   { permissions: new Set(), isSuperadmin: false }. hasPermission then returns false.
 *   requirePermission receives false and returns 403 (deny). This is NOT a 500 path —
 *   infrastructure failures are absorbed here and produce a deterministic deny at the
 *   middleware layer. The 500 path in requirePermission is reserved for programming errors
 *   (unexpected throws from hasPermission itself).
 *
 * Superadmin detection (C1 design-review):
 *   The DB query LEFT JOINs admin_role_permissions. For a superadmin with no permission
 *   rows, the result contains one NULL-permission_key row with is_superadmin=1.
 *   The iteration MUST check is_superadmin on ALL rows (including the NULL row) to
 *   correctly detect superadmin status. A non-iterating approach (e.g. rows[0]) is WRONG.
 */

import { getRaw, setRaw, invalidateByLogicalPrefix } from "../../../../services/redisCache.service.js";
import { pool } from "../../../../config/db.js";

/**
 * Redis TTL for RBAC cache entries.
 * Unit: milliseconds. redisCache.service.js setRaw converts ms to seconds internally.
 * 300_000 ms = 300 s = 5 minutes.
 * DO NOT use literal 300 or 60 here — both are wrong (300 = 300ms, 60 = 60ms).
 */
export const RBAC_CACHE_TTL_MS = 300_000;

/**
 * Resolve an admin's RBAC state: their full permission Set and superadmin status.
 *
 * Resolution order:
 *   1. Redis / in-memory LRU (via getRaw)
 *   2. DB query (admin_user_roles JOIN admin_roles LEFT JOIN admin_role_permissions)
 *   3. On DB failure: return empty result (deny-safe)
 *
 * @param {number} adminId  The admin's numeric id from req.user.id
 * @returns {Promise<{ permissions: Set<string>, isSuperadmin: boolean }>}
 */
export async function getAdminRbac(adminId) {
  const cacheKey = `admin:rbac:${adminId}:perms`;

  // Layer 1: Redis / LRU cache
  try {
    const cached = await getRaw(cacheKey);
    if (cached !== null) {
      const parsed = JSON.parse(cached);
      return {
        permissions: new Set(parsed.permissions),
        isSuperadmin: Boolean(parsed.isSuperadmin),
      };
    }
  } catch (err) {
    console.warn(`[rbac:service] Redis read error for admin ${adminId}:`, err.message);
    // Fall through to DB
  }

  // Layer 2: DB query
  try {
    // C1: LEFT JOIN ensures superadmin role's NULL permission_key row is returned.
    // GROUP BY p.permission_key groups NULL values together (MySQL treats NULL = NULL in GROUP BY).
    // MAX(r.is_superadmin) per group ensures superadmin flag is detected even when
    // the admin holds both a superadmin role and a regular role simultaneously.
    const [rows] = await pool.query(
      `SELECT p.permission_key, MAX(r.is_superadmin) AS is_superadmin
       FROM admin_user_roles aur
       JOIN admin_roles r ON r.id = aur.role_id
       LEFT JOIN admin_role_permissions arp ON arp.role_id = r.id
       LEFT JOIN admin_permissions p ON p.id = arp.permission_id
       WHERE aur.admin_id = ?
       GROUP BY p.permission_key`,
      [adminId],
    );

    // C1: iterate ALL rows — superadmin detection requires checking every row,
    // including the NULL-permission_key row that carries is_superadmin=1
    // for a superadmin role with no permission assignments.
    let isSuperadmin = false;
    const permissions = new Set();
    for (const row of rows) {
      if (row.is_superadmin) isSuperadmin = true;
      if (row.permission_key) permissions.add(row.permission_key);
    }

    // Cache the resolved state — fire-and-forget (cache failure does not fail the request)
    setRaw(
      cacheKey,
      JSON.stringify({ permissions: [...permissions], isSuperadmin }),
      RBAC_CACHE_TTL_MS,
    ).catch(() => {});

    return { permissions, isSuperadmin };
  } catch (err) {
    console.warn(`[rbac:service] DB error resolving RBAC for admin ${adminId}:`, err.message);
    // Return deny-safe empty state — requirePermission will return 403
    return { permissions: new Set(), isSuperadmin: false };
  }
}

/**
 * Check whether an admin has a specific permission.
 * Superadmin bypass: if isSuperadmin is true, all permission checks return true.
 *
 * @param {number} adminId       The admin's numeric id
 * @param {string} permissionKey e.g. 'shops:read', 'rbac:manage'
 * @returns {Promise<boolean>}
 */
export async function hasPermission(adminId, permissionKey) {
  const { permissions, isSuperadmin } = await getAdminRbac(adminId);
  if (isSuperadmin) return true;
  return permissions.has(permissionKey);
}

/**
 * Invalidate RBAC cache entries.
 *
 * Per-admin invalidation (adminId provided):
 *   Prefix: 'admin:rbac:{adminId}:'
 *   Colon-terminated to prevent numeric collision (B2).
 *   Only affects the specific admin's cache entry.
 *
 * Bulk invalidation (adminId = null or undefined):
 *   Prefix: 'admin:rbac:'
 *   Use when a role's permission set changes — affects all admins holding that role.
 *
 * Both cases are fire-and-forget at the call site (controller).
 *
 * @param {number|null} adminId  Specific admin id, or null/undefined for bulk invalidation
 */
export async function invalidateAdminRbacCache(adminId) {
  if (adminId != null) {
    await invalidateByLogicalPrefix(`admin:rbac:${adminId}:`);
  } else {
    await invalidateByLogicalPrefix("admin:rbac:");
  }
}
