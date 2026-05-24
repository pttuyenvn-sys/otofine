/**
 * Request-scoped memoization. Attaches a tiny per-request map to the
 * Express `req` object and lets handlers call the same async fn
 * multiple times within one request without re-hitting the DB.
 *
 * Use cases inside a single request:
 *   - `getPublicShopBySlug` called by middleware-style helpers AND by
 *     the route service.
 *   - Future SSR helpers that load the same slug from two components.
 *
 * Lives ONLY for the lifetime of the response. There's no GC concern.
 */
export function memoOnRequest(req, key, loader) {
  if (!req) return loader();
  if (!req.__shopsiteMemo) req.__shopsiteMemo = new Map();
  if (req.__shopsiteMemo.has(key)) return req.__shopsiteMemo.get(key);
  const p = Promise.resolve().then(loader);
  req.__shopsiteMemo.set(key, p);
  return p;
}
