import { pool } from "../../../config/db.js";

/**
 * Phase 8.1 — RFQ supplier matching: shop specialization repository.
 *
 * Given a set of candidate shop ids and the RFQ's normalised input,
 * pull the per-shop signals that drive the scorer:
 *
 *   - Base shop row (trust, branding, location, freshness)
 *   - Product count for the **target brand** (if RFQ has one)
 *   - Total product count
 *   - Per-system-group product count (for the RFQ's part)
 *   - Whether the shop has at least one product with the exact model
 *     OR year-range overlap (binary signal each)
 *
 * Everything is bulk-loaded — N+1 sub-queries would be lethal at
 * candidate pool sizes of 40+. Each helper returns a Map keyed by
 * shopId so the engine can stitch them together in O(N) at scoring
 * time.
 *
 * IMPORTANT: this repository is READ-ONLY. It never mutates `shops`,
 * `products`, or any RFQ table. It's safe to call from any context
 * (admin preview, dispatch dry-run, ML training data export, ...).
 */

/**
 * Pull the base rows (shop trust + branding + location).
 *
 * Same field set as `shopDirectory.repository.DIRECTORY_COLUMNS` so a
 * future merge of the two repositories is mechanical. We DO NOT
 * COALESCE here — the scorer wants to know which fields are missing.
 */
export async function loadShopBaseRows(shopIds) {
  if (!shopIds.length) return new Map();
  const ph = shopIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT
        s.id,
        s.slug,
        s.name,
        s.bio,
        s.avatar,
        COALESCE(s.cover_image, s.cover) AS cover,
        s.phone,
        -- Bug-fix Phase A.1: prefer the unified shops.zalo over
        -- shops.zalo_phone so RFQ-matcher specialization signals see
        -- the same Zalo contact the storefront renders.
        COALESCE(NULLIF(s.zalo, ''), NULLIF(s.zalo_phone, '')) AS zalo,
        s.facebook_url,
        s.provinceId,
        s.verified_at,
        s.published_at,
        s.createdAt,
        s.updatedAt,
        s.intro_html,
        s.descriptionHtml,
        s.last_seen_at
       FROM shops s
      WHERE s.id IN (${ph}) AND s.public_status = 'public'`,
    shopIds,
  );
  const map = new Map();
  for (const r of rows) map.set(Number(r.id), r);
  return map;
}

/**
 * Total product count for each shop. One grouped scan. Map<id, n>.
 */
export async function loadShopProductCounts(shopIds) {
  if (!shopIds.length) return new Map();
  const ph = shopIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT shopId, COUNT(*) AS n
       FROM products
      WHERE shopId IN (${ph})
      GROUP BY shopId`,
    shopIds,
  );
  const m = new Map();
  for (const r of rows) m.set(Number(r.shopId), Number(r.n) || 0);
  return m;
}

/**
 * For each shop, count distinct products whose `car_models.hang_xe`
 * matches the RFQ's vehicle brand. Empty Map when brand is null.
 *
 * Result: Map<shopId, { brandProductCount, hasModelMatch, hasYearMatch }>.
 *
 * Computed in ONE query so we don't fan-out per shop. The model /
 * year flags use boolean aggregation: `MAX(CASE WHEN … THEN 1 ELSE 0 END)`.
 */
export async function loadShopVehicleSpecialization(shopIds, vehicle) {
  if (!shopIds.length || !vehicle?.brand) return new Map();
  const ph = shopIds.map(() => "?").join(",");

  // mysql2 binds placeholders POSITIONALLY across the entire query
  // string. The SELECT extras render BEFORE the WHERE clause, so
  // any placeholders inside them must come FIRST in the params array.
  const yearClause =
    Number.isFinite(vehicle.year)
      ? `MAX(CASE
            WHEN pca.year_from IS NOT NULL
             AND pca.year_from <= ?
             AND (pca.year_to IS NULL OR pca.year_to >= ?)
            THEN 1 ELSE 0
          END)`
      : `0`;
  const modelClause = vehicle.model
    ? `MAX(CASE WHEN cm.ten_xe = ? THEN 1 ELSE 0 END)`
    : `0`;

  const selectParams = [];
  if (vehicle.model) selectParams.push(vehicle.model);
  if (Number.isFinite(vehicle.year)) selectParams.push(vehicle.year, vehicle.year);

  const [rows] = await pool.query(
    `SELECT
        p.shopId AS id,
        COUNT(DISTINCT p.id) AS brandProductCount,
        ${modelClause} AS hasModelMatch,
        ${yearClause} AS hasYearMatch
       FROM products p
       JOIN product_car_applications pca ON pca.productId = p.id
       JOIN car_models cm ON cm.id = pca.carModelId
      WHERE cm.hang_xe = ?
        AND p.shopId IN (${ph})
      GROUP BY p.shopId`,
    [...selectParams, vehicle.brand, ...shopIds],
  );

  const m = new Map();
  for (const r of rows) {
    m.set(Number(r.id), {
      brandProductCount: Number(r.brandProductCount) || 0,
      hasModelMatch: !!Number(r.hasModelMatch),
      hasYearMatch: !!Number(r.hasYearMatch),
    });
  }
  return m;
}

/**
 * For each shop, count products in the RFQ's resolved system_groups.
 * Empty Map when systemGroups is empty.
 *
 * Returns Map<shopId, { partProductCount, hasCategoryTag }>.
 * `hasCategoryTag` is a binary "shop has at least one product whose
 * part_knowledge.category_tag matches" — cheaper than tracking per-tag
 * counts and exactly what the scorer needs (one more bit of evidence).
 */
export async function loadShopPartSpecialization(shopIds, part) {
  if (!shopIds.length || !part?.systemGroups?.length) return new Map();
  const idPh = shopIds.map(() => "?").join(",");
  const sgPh = part.systemGroups.map(() => "?").join(",");

  const tagsClause = part.categoryTags?.length
    ? `MAX(CASE WHEN pk.category_tag IN (${part.categoryTags.map(() => "?").join(",")}) THEN 1 ELSE 0 END)`
    : `0`;

  // SELECT-clause placeholders bind first. categoryTags is the only
  // signal that lives inside the SELECT; system_groups + shopIds are
  // WHERE-side.
  const [rows] = await pool.query(
    `SELECT
        p.shopId AS id,
        COUNT(*) AS partProductCount,
        ${tagsClause} AS hasCategoryTag
       FROM products p
       JOIN part_knowledge pk ON pk.id = p.part_knowledge_id
      WHERE p.shopId IN (${idPh})
        AND pk.system_group IN (${sgPh})
      GROUP BY p.shopId`,
    [...(part.categoryTags || []), ...shopIds, ...part.systemGroups],
  );

  const m = new Map();
  for (const r of rows) {
    m.set(Number(r.id), {
      partProductCount: Number(r.partProductCount) || 0,
      hasCategoryTag: !!Number(r.hasCategoryTag),
    });
  }
  return m;
}

/**
 * Top brand share for each shop — used to derive specialization
 * labels ("chuyên Toyota") shown in the explainability metadata.
 * Returns Map<shopId, Array<{ brand, share }>> capped at 3.
 */
export async function loadShopBrandSpecialization(shopIds, totalCounts) {
  if (!shopIds.length) return new Map();
  const ph = shopIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT
        p.shopId AS id,
        cm.hang_xe AS brand,
        COUNT(DISTINCT p.id) AS cnt
       FROM products p
       JOIN product_car_applications pca ON pca.productId = p.id
       JOIN car_models cm ON cm.id = pca.carModelId
      WHERE p.shopId IN (${ph})
        AND cm.hang_xe IS NOT NULL AND cm.hang_xe <> ''
      GROUP BY p.shopId, cm.hang_xe
      ORDER BY p.shopId ASC, cnt DESC, brand ASC`,
    shopIds,
  );
  const m = new Map();
  for (const r of rows) {
    const id = Number(r.id);
    if (!m.has(id)) m.set(id, []);
    const list = m.get(id);
    if (list.length >= 3) continue;
    const total = totalCounts.get(id) || 0;
    const share = total > 0 ? Number(r.cnt) / total : 0;
    list.push({ brand: r.brand, productCount: Number(r.cnt) || 0, share });
  }
  return m;
}
