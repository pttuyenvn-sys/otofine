/**
 * Cache Redis-first, fallback memory (LRU giới hạn) — không crash nếu Redis lỗi.
 */

import Redis from "ioredis";

const PREFIX = process.env.CACHE_KEY_PREFIX || "otofine:v1:";

/** Version dữ liệu trong key — bump khi deploy để tránh stale đa server (ENV: CACHE_DATA_VERSION, APP_RELEASE, GIT_SHA). */
export const CACHE_DATA_VERSION = String(
  process.env.CACHE_DATA_VERSION ||
    process.env.APP_RELEASE ||
    process.env.GIT_SHA ||
    "1",
)
  .replace(/[^a-zA-Z0-9._-]/g, "")
  .slice(0, 64) || "1";

const MEMORY_MAX = Math.min(
  50_000,
  Math.max(500, Number(process.env.CACHE_MEMORY_MAX_KEYS) || 5000),
);

/** @type {Map<string, { exp: number, val: string }>} */
const memoryStore = new Map();
/** @type {string[]} */
const memoryLru = [];

let redisClient = null;
let redisDisabled = false;

function touchLru(memKey) {
  const i = memoryLru.indexOf(memKey);
  if (i >= 0) memoryLru.splice(i, 1);
  memoryLru.push(memKey);
  while (memoryLru.length > MEMORY_MAX) {
    const evict = memoryLru.shift();
    if (evict) memoryStore.delete(evict);
  }
}

function getRedisUrl() {
  return (
    process.env.REDIS_URL ||
    process.env.REDISCLOUD_URL ||
    (process.env.REDIS_HOST
      ? `redis://${process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : ""}${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
      : "")
  );
}

function createRedis() {
  const url = getRedisUrl();
  if (!url || redisDisabled) return null;
  try {
    const c = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    c.on("error", (err) => {
      console.warn("[redisCache] Redis error, fallback memory:", err.message);
      redisDisabled = true;
      try {
        c.disconnect();
      } catch {
        /* ignore */
      }
    });
    return c;
  } catch (e) {
    console.warn("[redisCache] Redis init failed, memory only:", e.message);
    redisDisabled = true;
    return null;
  }
}

async function getRedis() {
  if (redisDisabled) return null;
  if (!redisClient) {
    redisClient = createRedis();
    if (!redisClient) return null;
  }
  try {
    if (redisClient.status === "wait") {
      await redisClient.connect();
    }
    await redisClient.ping();
    return redisClient;
  } catch (e) {
    console.warn("[redisCache] ping failed, memory only:", e.message);
    redisDisabled = true;
    try {
      redisClient.disconnect();
    } catch {
      /* ignore */
    }
    redisClient = null;
    return null;
  }
}

function fullKey(key) {
  return `${PREFIX}dv${CACHE_DATA_VERSION}:${key}`;
}

/**
 * @param {string} key logical key (không gồm prefix)
 * @returns {Promise<string|null>}
 */
export async function getRaw(key) {
  const memKey = fullKey(key);
  const r = await getRedis();
  if (r) {
    try {
      return await r.get(memKey);
    } catch (e) {
      console.warn("[redisCache] get:", e.message);
    }
  }
  const hit = memoryStore.get(memKey);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    memoryStore.delete(memKey);
    return null;
  }
  touchLru(memKey);
  return hit.val;
}

/**
 * @param {string} key
 * @param {string} value
 * @param {number} ttlMs
 */
export async function setRaw(key, value, ttlMs) {
  const memKey = fullKey(key);
  const ttlSec = Math.max(1, Math.ceil((ttlMs || 15_000) / 1000));
  const r = await getRedis();
  if (r) {
    try {
      await r.set(memKey, value, "EX", ttlSec);
      return;
    } catch (e) {
      console.warn("[redisCache] set:", e.message);
    }
  }
  memoryStore.set(memKey, {
    val: value,
    exp: Date.now() + (ttlMs || 15_000),
  });
  touchLru(memKey);
}

export async function getJson(key) {
  const raw = await getRaw(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setJson(key, obj, ttlMs) {
  await setRaw(key, JSON.stringify(obj), ttlMs);
}

/**
 * Xóa đúng một logical key (Redis DEL + memory LRU). Không SCAN.
 * @param {string} key
 */
async function deleteRaw(key) {
  const memKey = fullKey(key);
  const r = await getRedis();
  if (r) {
    try {
      await r.del(memKey);
    } catch (e) {
      console.warn("[redisCache] del:", e.message);
    }
  }
  memoryStore.delete(memKey);
  const lruIdx = memoryLru.indexOf(memKey);
  if (lruIdx >= 0) memoryLru.splice(lruIdx, 1);
}

/**
 * Xóa cache chi tiết một sản phẩm — logical key detail:{id} only.
 * @param {number|string} id
 */
export async function invalidateDetailCache(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return;
  await deleteRaw(`detail:${n}`);
}

/**
 * @template T
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<T>} factory
 */
export async function getOrSetJson(key, ttlMs, factory) {
  const hit = await getJson(key);
  if (hit != null) return hit;
  const val = await factory();
  await setJson(key, val, ttlMs).catch(() => {});
  return val;
}

/**
 * Xóa mọi key logical có prefix (Redis SCAN) hoặc xóa memory khớp prefix.
 * @param {string} logicalPrefix ví dụ "card:first:"
 */
export async function invalidateByLogicalPrefix(logicalPrefix) {
  const pattern = `${PREFIX}dv${CACHE_DATA_VERSION}:${logicalPrefix}*`;
  const r = await getRedis();
  if (r) {
    try {
      let cursor = "0";
      do {
        const [next, keys] = await r.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          200,
        );
        cursor = next;
        if (keys.length) await r.del(...keys);
      } while (cursor !== "0");
    } catch (e) {
      console.warn("[redisCache] invalidate scan:", e.message);
    }
  }
  const memPrefix = `${PREFIX}dv${CACHE_DATA_VERSION}:${logicalPrefix}`;
  for (const k of memoryStore.keys()) {
    if (k.startsWith(memPrefix)) memoryStore.delete(k);
  }
  for (let i = memoryLru.length - 1; i >= 0; i--) {
    if (memoryLru[i].startsWith(memPrefix)) memoryLru.splice(i, 1);
  }
}

/** Xóa cache listing + detail (product surface). */
export async function invalidateListingCaches() {
  await invalidateByLogicalPrefix("listing:");
  await invalidateByLogicalPrefix("detail:");
}

/** Xóa cache filter reference (/api/filter/*). */
export async function invalidateFilterCaches() {
  await invalidateByLogicalPrefix("filter:");
}

/**
 * Tương thích ngược: flush listing + detail + filter (không còn full-namespace wipe).
 * Gọi từ invalidateListCache() sau import ảnh / đồng bộ PLV.
 */
export async function invalidateProductCaches() {
  await invalidateListingCaches();
  await invalidateFilterCaches();
}

/** @type {{ hits: number, misses: number }} */
const getOrSetMetrics = { hits: 0, misses: 0 };

function estimateMemoryStoreBytes() {
  let bytes = 0;
  for (const [memKey, entry] of memoryStore) {
    bytes += Buffer.byteLength(memKey, "utf8");
    bytes += Buffer.byteLength(entry?.val ?? "", "utf8");
  }
  return bytes;
}

/**
 * Metrics for getOrSetCache() instrumentation (process-local).
 */
export function getGetOrSetCacheMetrics() {
  const hits = getOrSetMetrics.hits;
  const misses = getOrSetMetrics.misses;
  const total = hits + misses;
  return {
    hits,
    misses,
    hitRate: total === 0 ? 0 : Number((hits / total).toFixed(4)),
  };
}

export function recordGetOrSetCacheHit() {
  getOrSetMetrics.hits += 1;
}

export function recordGetOrSetCacheMiss() {
  getOrSetMetrics.misses += 1;
}

export { PREFIX as CACHE_GLOBAL_PREFIX };

/** Process-local memory fallback stats (audit / verify). */
export function getMemoryCacheStats() {
  const memoryBytes = estimateMemoryStoreBytes();
  return {
    keyCount: memoryStore.size,
    maxKeys: MEMORY_MAX,
    lruLength: memoryLru.length,
    memoryBytes,
    memoryMB: Number((memoryBytes / (1024 * 1024)).toFixed(4)),
  };
}

/**
 * Snapshot for GET /api/admin/cache-stats.
 */
export function getBackendCacheStatsSnapshot() {
  const memory = getMemoryCacheStats();
  const metrics = getGetOrSetCacheMetrics();
  return {
    keys: memory.keyCount,
    hits: metrics.hits,
    misses: metrics.misses,
    hitRate: metrics.hitRate,
    memoryMB: memory.memoryMB,
  };
}
