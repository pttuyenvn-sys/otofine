import { pool } from "../../../config/db.js";
import {
  MISS_SENTINEL,
  TTL_MS,
  shopExistenceCache,
} from "../cache/caches.js";
import { shopsiteLog } from "../observability/logger.js";
import { buildPublicProductWhereClause } from "../../../modules/products/services/productPublicVisibility.server.js";
import { getSchemaCapabilities } from "../../../utils/schemaCapabilities.js";

/**
 * Read-only repository for the public shop site.
 *
 * IMPORTANT: this repository only ever SELECTs. It never touches the
 * existing seller-protected shop CRUD path. The `shops` table itself
 * is shared, but the queries below filter strictly by `slug` and
 * `public_status = 'public'` so a non-published shop can never leak.
 *
 * The slug → row lookup is fronted by `shopExistenceCache`. Both the
 * "exists+public" path and the "not found / not public" path are
 * cached (with different TTLs) so brute-force scans for invalid slugs
 * stop hitting the DB after the first attempt.
 */

const PUBLIC_SHOP_COLUMNS = `
  s.id,
  s.slug,
  s.public_status,
  s.name,
  s.bio,
  s.avatar,
  COALESCE(s.cover_image, s.cover) AS cover,
  s.phone,
  s.email,
  -- Bug-fix Phase A.1: the unified /shop/settings page writes the Basic
  -- tab value into shops.zalo while the public-page tab writes
  -- shops.zalo_phone. Prefer the unified canonical (shops.zalo) here so
  -- storefronts pick up the value just saved on /shop/settings, falling
  -- back to shops.zalo_phone for legacy rows that were never re-saved.
  -- See backend/utils/resolveShopZalo.js for the application-layer twin.
  COALESCE(NULLIF(s.zalo, ''), NULLIF(s.zalo_phone, '')) AS zalo,
  s.facebook_url,
  s.website,
  s.provinceId,
  s.districtId,
  s.wardId,
  s.addressDetail,
  s.working_hours,
  s.descriptionHtml,
  s.intro_html,
  s.salePolicy,
  s.warrantyPolicy,
  s.lat,
  s.lng,
  s.map_embed_url,
  s.verified_at,
  s.published_at,
  -- Seller-declared "operating since" year. Optional, nullable;
  -- storefront consumers (toPublicDto + yearsFromFoundedOrDate) fall
  -- back to s.createdAt when this is NULL so existing rows continue
  -- to render the same value they did before migration 045.
  s.founded_year,
  s.createdAt,
  s.updatedAt
`;

/**
 * Resolve a slug to a publicly-visible shop row, or null.
 *
 * Cache contract:
 *   - hit + public           → cached as the row object       (5 min)
 *   - missing / not-public   → cached as MISS_SENTINEL        (1 min)
 *   - empty slug             → never cached, returns null instantly
 *   - DB error               → propagated, NOTHING cached
 *
 * Callers MUST treat the return value as read-only (`Object.freeze`
 * would be safer but the row is consumed by `toPublicDto` which only
 * reads it; we trust the call sites).
 */
export async function findPublicShopBySlug(slug) {
  if (!slug) return null;

  const cached = shopExistenceCache.get(slug);
  if (cached !== undefined) {
    shopsiteLog.info("cache.hit", { cache: "shopExistence", slug, exists: cached !== MISS_SENTINEL });
    return cached === MISS_SENTINEL ? null : cached;
  }

  const [rows] = await pool.query(
    `
      SELECT ${PUBLIC_SHOP_COLUMNS},
             a.tinh_tp AS provinceLabel
      FROM shops s
      LEFT JOIN address a ON a.id = s.provinceId
      WHERE s.slug = ? AND s.public_status = 'public'
      LIMIT 1
    `,
    [slug],
  );
  const row = rows[0] || null;

  shopExistenceCache.set(slug, row || MISS_SENTINEL, {
    ttlMs: row ? TTL_MS.existence : TTL_MS.existenceMiss,
    tags: [`shop:${slug}`],
  });
  shopsiteLog.info("cache.miss", { cache: "shopExistence", slug, exists: !!row });
  return row;
}

/** Count published products owned by the shop. */
export async function countPublicShopProducts(shopId) {
  if (!shopId) return 0;
  const vis = await buildPublicProductWhereClause({ aliasP: "p", skipShopGate: true });
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM products p WHERE p.shopId = ? ${vis.sql}`,
    [shopId],
  );
  return Number(rows[0]?.n) || 0;
}

/**
 * Phase 6B.6 — moderation + activity inputs for indexing eligibility.
 * Single round-trip; reuses public product visibility rules.
 */
export async function fetchShopIndexabilityContext(shopId) {
  if (!shopId) {
    return {
      productCount: 0,
      approvedModerationCount: 0,
      rejectedModerationCount: 0,
      lastStorefrontActivityAt: null,
      latestProductAt: null,
    };
  }

  const vis = await buildPublicProductWhereClause({ aliasP: "p", skipShopGate: true });
  const caps = await getSchemaCapabilities();
  const hasModeration = caps.hasProductGovernance;

  const metricPromise = pool.query(
    `
      SELECT COUNT(*) AS productCount,
             MAX(p.updatedAt) AS latestProductAt
      FROM products p
      WHERE p.shopId = ?
      ${vis.sql}
    `,
    [shopId],
  );

  const moderationPromise = hasModeration
    ? pool.query(
        `
          SELECT
            SUM(CASE WHEN TRIM(LOWER(moderation_status)) = 'approved' THEN 1 ELSE 0 END) AS approvedModerationCount,
            SUM(CASE WHEN TRIM(LOWER(moderation_status)) = 'rejected' THEN 1 ELSE 0 END) AS rejectedModerationCount
          FROM products
          WHERE shopId = ?
        `,
        [shopId],
      )
    : Promise.resolve([[{ approvedModerationCount: 0, rejectedModerationCount: 0 }]]);

  const activityPromise = caps.hasStorefrontEvents
    ? pool.query(
        `
          SELECT MAX(occurred_at) AS lastStorefrontActivityAt
          FROM shop_storefront_events
          WHERE shop_id = ?
        `,
        [shopId],
      )
    : Promise.resolve([[{ lastStorefrontActivityAt: null }]]);

  const [[metricRows], [modRows], [activityRows]] = await Promise.all([
    metricPromise,
    moderationPromise,
    activityPromise,
  ]);

  const metrics = metricRows[0] || {};
  const moderation = modRows[0] || {};
  const activity = activityRows[0] || {};

  return {
    productCount: Number(metrics.productCount) || 0,
    approvedModerationCount: Number(moderation.approvedModerationCount) || 0,
    rejectedModerationCount: Number(moderation.rejectedModerationCount) || 0,
    lastStorefrontActivityAt: activity.lastStorefrontActivityAt || null,
    latestProductAt: metrics.latestProductAt || null,
  };
}

/**
 * Distinct categories that this shop has products in.
 * Joins via the existing `product_category_map` ↔ `product_categories`.
 *
 * `slug` is preferred from `canonical_name` when present, otherwise we
 * synthesize `c-<id>` so the products filter has a deterministic,
 * reversible key — see the matching `pc.id = ?` branch in
 * `shopPublicProducts.repository.listShopProducts`.
 *
 * This fallback exists because production data has many categories
 * with NULL `canonical_name`; without it, every sidebar click on
 * those categories used to filter by a non-matching string and
 * return zero results.
 */
/**
 * Top vehicle brands for a shop, ordered by distinct product coverage.
 * Used by the storefront trust badges ("Chuyên Toyota / Peugeot…").
 *
 * Returns at most `limit` brands. Empty array when the shop has no
 * fitment data — the trust component then gracefully drops the
 * "Chuyên X" chip.
 */
export async function listShopTopBrands(shopId, limit = 3) {
  if (!shopId) return [];
  const vis = await buildPublicProductWhereClause({ aliasP: "p", skipShopGate: true });
  const [rows] = await pool.query(
    `
      SELECT cm.hang_xe AS brand, COUNT(DISTINCT pca.productId) AS cnt
      FROM product_car_applications pca
      JOIN car_models cm ON cm.id = pca.carModelId
      JOIN products p     ON p.id  = pca.productId
      WHERE p.shopId = ? AND cm.hang_xe IS NOT NULL AND cm.hang_xe <> ''
      ${vis.sql}
      GROUP BY cm.hang_xe
      ORDER BY cnt DESC, brand ASC
      LIMIT ?
    `,
    [shopId, Number(limit) || 3],
  );
  return rows.map((r) => ({ brand: r.brand, productCount: Number(r.cnt) || 0 }));
}

export async function listShopCategories(shopId) {
  if (!shopId) return [];
  const vis = await buildPublicProductWhereClause({ aliasP: "p", skipShopGate: true });
  const [rows] = await pool.query(
    `
      SELECT
        pc.id,
        pc.category_name AS name,
        pc.canonical_name AS slug,
        COUNT(DISTINCT p.id) AS productCount
      FROM products p
      JOIN product_category_map pcm ON pcm.product_id = p.id
      JOIN product_categories pc    ON pc.id = pcm.category_id
      WHERE p.shopId = ?
      ${vis.sql}
      GROUP BY pc.id, pc.category_name, pc.canonical_name
      ORDER BY productCount DESC, pc.category_name ASC
      LIMIT 50
    `,
    [shopId],
  );
  return rows.map((r) => ({
    ...r,
    slug: r.slug && String(r.slug).trim() ? String(r.slug).trim() : `c-${r.id}`,
  }));
}

/**
 * Phase 6B.5/6B.6 — batch storefront rows for the apex sitemap builder.
 *
 * Returns candidate public shops with health inputs. Final indexability
 * filtering happens in seo.controller via evaluateStorefrontSeoIndexability
 * so sitemap URLs align with robots metadata.
 */
export async function listSitemapEligibleStorefronts() {
  const vis = await buildPublicProductWhereClause({ aliasP: "p", skipShopGate: true });
  const caps = await getSchemaCapabilities();

  const activityJoin = caps.hasStorefrontEvents
    ? `LEFT JOIN (
        SELECT shop_id, MAX(occurred_at) AS lastStorefrontActivityAt
        FROM shop_storefront_events
        GROUP BY shop_id
      ) sse ON sse.shop_id = s.id`
    : "";
  const activitySelect = caps.hasStorefrontEvents
    ? "sse.lastStorefrontActivityAt,"
    : "NULL AS lastStorefrontActivityAt,";

  const moderationJoin = caps.hasProductGovernance
    ? `LEFT JOIN (
        SELECT
          shopId,
          SUM(CASE WHEN TRIM(LOWER(moderation_status)) = 'approved' THEN 1 ELSE 0 END) AS approvedModerationCount,
          SUM(CASE WHEN TRIM(LOWER(moderation_status)) = 'rejected' THEN 1 ELSE 0 END) AS rejectedModerationCount
        FROM products
        WHERE shopId IS NOT NULL
        GROUP BY shopId
      ) pm ON pm.shopId = s.id`
    : "";
  const moderationSelect = caps.hasProductGovernance
    ? `COALESCE(pm.approvedModerationCount, 0) AS approvedModerationCount,
       COALESCE(pm.rejectedModerationCount, 0) AS rejectedModerationCount,`
    : `0 AS approvedModerationCount,
       0 AS rejectedModerationCount,`;

  const groupActivity = caps.hasStorefrontEvents ? ", sse.lastStorefrontActivityAt" : "";
  const groupModeration = caps.hasProductGovernance
    ? ", pm.approvedModerationCount, pm.rejectedModerationCount"
    : "";

  const [rows] = await pool.query(
    `
      SELECT
        s.slug,
        s.public_status,
        s.phone,
        s.avatar,
        COALESCE(s.cover_image, s.cover) AS cover,
        s.intro_html,
        s.descriptionHtml,
        s.bio,
        s.updatedAt AS shopUpdatedAt,
        ${activitySelect}
        ${moderationSelect}
        MAX(p.updatedAt) AS latestProductAt,
        COUNT(p.id) AS publicProductCount
      FROM shops s
      INNER JOIN products p ON p.shopId = s.id
      ${activityJoin}
      ${moderationJoin}
      WHERE s.public_status = 'public'
        AND s.slug IS NOT NULL
        AND CHAR_LENGTH(TRIM(s.slug)) >= 4
        AND (
          (s.avatar IS NOT NULL AND TRIM(s.avatar) <> '')
          OR (s.cover_image IS NOT NULL AND TRIM(s.cover_image) <> '')
          OR (s.cover IS NOT NULL AND TRIM(s.cover) <> '')
        )
        AND TRIM(COALESCE(s.intro_html, s.descriptionHtml, s.bio, '')) <> ''
        AND TRIM(COALESCE(s.phone, '')) <> ''
        ${vis.sql}
      GROUP BY
        s.id,
        s.slug,
        s.public_status,
        s.phone,
        s.avatar,
        s.cover_image,
        s.cover,
        s.intro_html,
        s.descriptionHtml,
        s.bio,
        s.updatedAt
        ${groupActivity}
        ${groupModeration}
      HAVING COUNT(p.id) >= 1
      ORDER BY s.slug ASC
    `,
  );
  return rows;
}
