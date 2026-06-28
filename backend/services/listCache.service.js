/**
 * Lớp tương thích: cache thực tế nằm ở redisCache.service.js (Redis + fallback memory).
 */

import * as redisCache from "./redisCache.service.js";

export async function invalidateListCache() {
  await redisCache.invalidateProductCaches();
}

/**
 * @template T
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<T>} factory
 * @returns {Promise<T>}
 */
export async function getOrSetCache(key, ttlMs, factory) {
  const hit = await redisCache.getJson(key);
  if (hit != null) {
    redisCache.recordGetOrSetCacheHit();
    return hit;
  }
  redisCache.recordGetOrSetCacheMiss();
  const val = await factory();
  await redisCache.setJson(key, val, ttlMs).catch(() => {});
  return val;
}
