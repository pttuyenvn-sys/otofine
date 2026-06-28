/**
 * Edge-safe shop lifecycle probe for sunset redirects.
 *
 * Authoritative source: GET /api/public/shops/:slug/lifecycle
 *
 * @typedef {{ exists: boolean, publicStatus: string | null, redirectEligible: boolean }} ShopLifecycle
 */

import { isShopSubdomainAllowed } from "@/lib/shopHost";
import { resolveMiddlewareApiBase } from "@/lib/shopsite/middlewareApiBase";

const CACHE = new Map();
const CACHE_TTL_MS = 60_000;

/** @type {ShopLifecycle} */
const UNKNOWN_LIFECYCLE = Object.freeze({
  exists: false,
  publicStatus: null,
  redirectEligible: false,
});

/**
 * @param {unknown} body
 * @returns {ShopLifecycle | null}
 */
function parseLifecycleBody(body) {
  if (!body || typeof body !== "object") return null;
  const exists = Boolean(body.exists);
  const publicStatus =
    body.publicStatus == null ? null : String(body.publicStatus).trim().toLowerCase();
  const redirectEligible = Boolean(body.redirectEligible);
  return { exists, publicStatus, redirectEligible };
}

/**
 * @param {string} slug
 * @returns {Promise<ShopLifecycle>}
 */
export async function resolveShopLifecycle(slug) {
  const key = String(slug || "").trim().toLowerCase();
  if (!key) return UNKNOWN_LIFECYCLE;

  const hit = CACHE.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = `${resolveMiddlewareApiBase()}/public/shops/${encodeURIComponent(key)}/lifecycle`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`lifecycle ${res.status}`);
    }
    const body = parseLifecycleBody(await res.json());
    const value = body || UNKNOWN_LIFECYCLE;
    CACHE.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    // Transient API failure: fail-open for allowlisted live shops only.
    if (isShopSubdomainAllowed(key)) {
      const fallback = {
        exists: true,
        publicStatus: "public",
        redirectEligible: false,
      };
      CACHE.set(key, { value: fallback, expires: Date.now() + CACHE_TTL_MS });
      return fallback;
    }
    return UNKNOWN_LIFECYCLE;
  }
}

/**
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
export async function verifyPublicShopSlug(slug) {
  const lifecycle = await resolveShopLifecycle(slug);
  return lifecycle.exists && lifecycle.publicStatus === "public";
}
