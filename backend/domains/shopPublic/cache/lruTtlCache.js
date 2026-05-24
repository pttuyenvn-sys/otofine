/**
 * Tiny LRU + per-entry TTL cache.
 *
 * Why hand-rolled instead of `lru-cache` / `quick-lru`:
 *   - The hot path is `get` on a Map keyed by short strings; Map already
 *     preserves insertion order, so LRU is one delete + one set per hit.
 *   - We want per-entry TTL (different routes use different TTLs), which
 *     `lru-cache` ≥10 supports but adds noticeable allocator pressure.
 *   - We want tag-based invalidation (evict-by-slug) without iterating
 *     the whole map every time the seller hits Save.
 *   - We need usable metrics (hits, misses, sets, evictions) WITHOUT a
 *     second dependency.
 *
 * Cost per cache: O(1) get/set; O(k) invalidateTag where k = entries
 * carrying that tag (kept on a side WeakMap-like index).
 *
 * NOT a process-shared cache. PM2 single-instance is fine; a HA
 * rollout will need Redis or similar — see audit/shop-public-phase4.5
 * "Future work".
 */

export function createLruTtlCache({ name, max = 500, defaultTtlMs = 60_000 }) {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error(`createLruTtlCache: invalid max=${max}`);
  }
  const store = new Map();           // key → { value, expiresAt, tags }
  const tagIndex = new Map();        // tag → Set<key>
  let hits = 0;
  let misses = 0;
  let sets = 0;
  let evictions = 0;
  let expirations = 0;

  function indexTag(tag, key) {
    let set = tagIndex.get(tag);
    if (!set) {
      set = new Set();
      tagIndex.set(tag, set);
    }
    set.add(key);
  }

  function deindex(entry, key) {
    if (!entry?.tags) return;
    for (const tag of entry.tags) {
      const set = tagIndex.get(tag);
      if (!set) continue;
      set.delete(key);
      if (set.size === 0) tagIndex.delete(tag);
    }
  }

  function deleteKey(key) {
    const entry = store.get(key);
    if (!entry) return false;
    store.delete(key);
    deindex(entry, key);
    return true;
  }

  function get(key) {
    const entry = store.get(key);
    if (!entry) {
      misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      deleteKey(key);
      expirations += 1;
      misses += 1;
      return undefined;
    }
    // LRU bump: re-insert keeps Map insertion order = recency.
    store.delete(key);
    store.set(key, entry);
    hits += 1;
    return entry.value;
  }

  function set(key, value, { ttlMs = defaultTtlMs, tags } = {}) {
    if (store.has(key)) deleteKey(key);
    while (store.size >= max) {
      // Evict the oldest entry (first inserted = least recently used).
      const oldestKey = store.keys().next().value;
      if (oldestKey === undefined) break;
      const oldEntry = store.get(oldestKey);
      store.delete(oldestKey);
      deindex(oldEntry, oldestKey);
      evictions += 1;
    }
    const tagsArr = Array.isArray(tags) && tags.length ? Array.from(new Set(tags)) : null;
    const expiresAt = Date.now() + Math.max(1, Number(ttlMs) || defaultTtlMs);
    const entry = { value, expiresAt, tags: tagsArr };
    store.set(key, entry);
    if (tagsArr) for (const t of tagsArr) indexTag(t, key);
    sets += 1;
  }

  function invalidateTag(tag) {
    const keys = tagIndex.get(tag);
    if (!keys || keys.size === 0) return 0;
    let n = 0;
    for (const key of Array.from(keys)) {
      if (deleteKey(key)) n += 1;
    }
    return n;
  }

  function clear() {
    store.clear();
    tagIndex.clear();
  }

  function stats() {
    const total = hits + misses;
    return {
      name,
      size: store.size,
      max,
      hits,
      misses,
      sets,
      evictions,
      expirations,
      hitRatio: total === 0 ? 0 : Number((hits / total).toFixed(4)),
      tagIndexKeys: tagIndex.size,
    };
  }

  function resetStats() {
    hits = 0;
    misses = 0;
    sets = 0;
    evictions = 0;
    expirations = 0;
  }

  return { get, set, delete: deleteKey, invalidateTag, clear, stats, resetStats };
}
