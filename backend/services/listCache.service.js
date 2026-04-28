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
  return redisCache.getOrSetJson(key, ttlMs, factory);
}
