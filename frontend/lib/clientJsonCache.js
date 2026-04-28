/**
 * Cache JSON GET nhẹ cho client — giảm trùng lặp / bớt round-trip khi đổi filter.
 * Không dùng cho list/search sản phẩm (cần dữ liệu mới).
 */

const store = new Map();
const inflight = new Map();

/**
 * @param {string} url
 * @param {{ ttlMs?: number, init?: RequestInit }} [opts]
 */
export async function fetchJsonCached(url, opts = {}) {
  const { ttlMs = 120_000, init } = opts;
  const now = Date.now();
  const hit = store.get(url);
  if (hit && hit.expires > now) {
    return hit.data;
  }

  if (inflight.has(url)) {
    return inflight.get(url);
  }

  const p = (async () => {
    try {
      const res = await fetch(url, {
        ...init,
        method: "GET",
      });
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      const data = await res.json();
      store.set(url, { data, expires: Date.now() + ttlMs });
      return data;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, p);
  return p;
}

export function invalidateJsonCachePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
