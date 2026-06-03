import { pool } from "../../../config/db.js";
import { buildApprovedWithImageCountSumSql } from "../../../utils/productImageCoverageSql.server.js";

const FEATURED_CANDIDATE_CAP = 200;
const RFQ_WINDOW_DAYS = 30;

/** Cached featured product aggregate subquery (schema-safe image coverage). */
let productAggSubqueryPromise = null;

async function productAggSubquery() {
  if (!productAggSubqueryPromise) {
    productAggSubqueryPromise = (async () => {
      const approvedWithImageCount = await buildApprovedWithImageCountSumSql("p");
      return `
    SELECT
      p.shopId AS shopId,
      COUNT(*) AS productCount,
      SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'rejected' THEN 1 ELSE 0 END) AS rejectedModerationCount,
      SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'approved' THEN 1 ELSE 0 END) AS approvedModerationCount,
      ${approvedWithImageCount},
      SUM(
        CASE
          WHEN TRIM(LOWER(p.moderation_status)) = 'approved'
            AND COALESCE(p.price, 0) > 0
          THEN 1 ELSE 0
        END
      ) AS approvedWithPriceCount
    FROM products p
    WHERE p.shopId IS NOT NULL
    GROUP BY p.shopId
  `;
    })();
  }
  return productAggSubqueryPromise;
}

function rfqCountSubquery() {
  return `
    SELECT shop_id AS shopId, COUNT(*) AS rfqCount30d
    FROM rfq_dispatches
    WHERE created_at >= (NOW() - INTERVAL ${RFQ_WINDOW_DAYS} DAY)
    GROUP BY shop_id
  `;
}

async function loadProductCounts(shopIds) {
  if (!shopIds.length) return new Map();
  const placeholders = shopIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT p.shopId, COUNT(*) AS n
       FROM products p
      WHERE p.shopId IN (${placeholders})
        AND TRIM(LOWER(COALESCE(p.moderation_status, ''))) = 'approved'
      GROUP BY p.shopId`,
    shopIds,
  );
  const out = new Map();
  for (const r of rows) out.set(Number(r.shopId), Number(r.n) || 0);
  return out;
}

async function loadTopBrands(shopIds, perShop = 3) {
  if (!shopIds.length) return new Map();
  const placeholders = shopIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT p.shopId, cm.hang_xe AS brand, COUNT(DISTINCT pca.productId) AS cnt
       FROM product_car_applications pca
       JOIN car_models cm ON cm.id = pca.carModelId
       JOIN products p ON p.id = pca.productId
      WHERE p.shopId IN (${placeholders})
        AND TRIM(LOWER(COALESCE(p.moderation_status, ''))) = 'approved'
        AND cm.hang_xe IS NOT NULL AND cm.hang_xe <> ''
      GROUP BY p.shopId, cm.hang_xe
      ORDER BY p.shopId ASC, cnt DESC, brand ASC`,
    shopIds,
  );
  const acc = new Map();
  for (const r of rows) {
    const id = Number(r.shopId);
    if (!acc.has(id)) acc.set(id, []);
    const list = acc.get(id);
    if (list.length < perShop) {
      list.push({ brand: r.brand, productCount: Number(r.cnt) || 0 });
    }
  }
  return acc;
}

async function loadProvinces(provinceIds) {
  const unique = Array.from(new Set(provinceIds.filter((id) => id != null)));
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT id, tinh_tp AS name, tinh_tp_slug AS slug
       FROM address
      WHERE id IN (${placeholders})`,
    unique,
  );
  const out = new Map();
  for (const r of rows) out.set(Number(r.id), { name: r.name, slug: r.slug });
  return out;
}

/**
 * Public featured candidates — one bounded scan + three bulk enrichers.
 * @param {{ includeStorefrontEvents?: boolean, includeEnforcement?: boolean }} [options]
 */
export async function listFeaturedStorefrontCandidates(options = {}) {
  const includeStorefrontEvents = options.includeStorefrontEvents !== false;
  const includeEnforcement = options.includeEnforcement !== false;
  const aggSubquery = await productAggSubquery();

  const activityJoin = includeStorefrontEvents
    ? `LEFT JOIN (
        SELECT shop_id, MAX(occurred_at) AS lastStorefrontActivityAt
        FROM shop_storefront_events
        GROUP BY shop_id
      ) sse ON sse.shop_id = s.id`
    : "";
  const activitySelect = includeStorefrontEvents
    ? "sse.lastStorefrontActivityAt,"
    : "NULL AS lastStorefrontActivityAt,";

  const enforcementJoin = includeEnforcement
    ? `LEFT JOIN (
        SELECT shop_id
        FROM admin_shop_suspensions
        WHERE lifted_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW(3))
        GROUP BY shop_id
      ) enf ON enf.shop_id = s.id`
    : "";
  const enforcementSelect = includeEnforcement
    ? "CASE WHEN enf.shop_id IS NOT NULL THEN 1 ELSE 0 END AS hasEnforcementSuspension,"
    : "0 AS hasEnforcementSuspension,";

  const [shopRows] = await pool.query(
    `
      SELECT
        s.id,
        s.slug,
        s.name,
        s.bio,
        s.avatar,
        COALESCE(s.cover_image, s.cover) AS cover,
        s.phone,
        COALESCE(NULLIF(s.zalo, ''), NULLIF(s.zalo_phone, '')) AS zalo,
        s.zalo_phone AS zaloPhone,
        s.facebook_url,
        s.provinceId,
        s.updatedAt,
        s.verified_at,
        s.intro_html,
        s.descriptionHtml,
        s.public_status AS publicStatus,
        sa.status AS accountStatus,
        COALESCE(pc.approvedModerationCount, 0) AS approvedModerationCount,
        COALESCE(pc.approvedWithImageCount, 0) AS approvedWithImageCount,
        COALESCE(pc.approvedWithPriceCount, 0) AS approvedWithPriceCount,
        COALESCE(pc.productCount, 0) AS productCount,
        COALESCE(pc.rejectedModerationCount, 0) AS rejectedModerationCount,
        COALESCE(rfq.rfqCount30d, 0) AS rfqCount30d,
        ${activitySelect}
        ${enforcementSelect}
        s.id AS _sortId
      FROM shops s
      LEFT JOIN shop_accounts sa ON sa.id = s.accountId
      LEFT JOIN (${aggSubquery}) pc ON pc.shopId = s.id
      LEFT JOIN (${rfqCountSubquery()}) rfq ON rfq.shopId = s.id
      ${activityJoin}
      ${enforcementJoin}
      WHERE LOWER(COALESCE(s.public_status, '')) = 'public'
        AND TRIM(COALESCE(s.slug, '')) <> ''
      ORDER BY s.id ASC
      LIMIT ${FEATURED_CANDIDATE_CAP}
    `,
  );

  const shopIds = shopRows.map((r) => Number(r.id));
  const [publicProductCounts, topBrands, provinces] = await Promise.all([
    loadProductCounts(shopIds),
    loadTopBrands(shopIds, 3),
    loadProvinces(shopRows.map((r) => r.provinceId)),
  ]);

  return shopRows.map((row) => ({
    ...row,
    productCount: publicProductCounts.get(Number(row.id)) || 0,
    topBrands: topBrands.get(Number(row.id)) || [],
    province: provinces.get(Number(row.provinceId))?.name || null,
    provinceSlug: provinces.get(Number(row.provinceId))?.slug || null,
    shopUpdatedAt: row.updatedAt,
    cover_image: row.cover,
    shopPhone: row.phone,
  }));
}
