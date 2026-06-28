import { pool } from "../../../config/db.js";
import {
  MISS_SENTINEL,
  TTL_MS,
  shopLifecycleCache,
} from "../cache/caches.js";
import { shopsiteLog } from "../observability/logger.js";

/**
 * Resolve slug → raw lifecycle row (any public_status), or null when
 * the slug does not exist. Does NOT filter by public visibility.
 */
export async function findShopLifecycleBySlug(slug) {
  if (!slug) return null;

  const cached = shopLifecycleCache.get(slug);
  if (cached !== undefined) {
    shopsiteLog.info("cache.hit", {
      cache: "shopLifecycle",
      slug,
      exists: cached !== MISS_SENTINEL,
    });
    return cached === MISS_SENTINEL ? null : cached;
  }

  const [rows] = await pool.query(
    `
      SELECT s.slug, s.public_status
      FROM shops s
      WHERE s.slug = ?
      LIMIT 1
    `,
    [slug],
  );
  const row = rows[0] || null;

  shopLifecycleCache.set(slug, row || MISS_SENTINEL, {
    ttlMs: row ? TTL_MS.existence : TTL_MS.existenceMiss,
    tags: [`shop:${slug}`, "shopLifecycle"],
  });
  shopsiteLog.info("cache.miss", {
    cache: "shopLifecycle",
    slug,
    exists: !!row,
  });
  return row;
}
