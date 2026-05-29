import { getProductModerationDetail } from "@/lib/adminApi";

const MAX_CACHE = 8;
/** @type {Map<number, { data: unknown, fetchedAt: number }>} */
const cache = new Map();
/** @type {Map<number, Promise<unknown>>} */
const inflight = new Map();

function touch(id, data) {
  cache.set(id, { data, fetchedAt: Date.now() });
  if (cache.size > MAX_CACHE) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0]?.[0];
    if (oldest != null) cache.delete(oldest);
  }
}

export function getCachedModerationDetail(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return cache.get(id)?.data ?? null;
}

export function invalidateModerationDetail(productId) {
  const id = Number(productId);
  if (Number.isFinite(id) && id > 0) cache.delete(id);
}

export function prefetchModerationDetail(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return;
  if (cache.has(id) || inflight.has(id)) return;
  fetchModerationDetailCached(id).catch(() => {});
}

export async function fetchModerationDetailCached(productId, options = {}) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("invalid product id");
  }

  const cached = cache.get(id);
  if (cached && !options.force) return cached.data;

  if (inflight.has(id)) return inflight.get(id);

  const req = getProductModerationDetail(id, { signal: options.signal })
    .then((res) => {
      const data = res.data ?? null;
      if (data) touch(id, data);
      inflight.delete(id);
      return data;
    })
    .catch((err) => {
      inflight.delete(id);
      throw err;
    });

  inflight.set(id, req);
  return req;
}
