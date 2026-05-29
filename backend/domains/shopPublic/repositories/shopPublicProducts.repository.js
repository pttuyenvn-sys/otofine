import { pool } from "../../../config/db.js";
import { appendProductPublicVisibilityWhereParts } from "../../../utils/productPublicVisibility.server.js";
import { buildPublicProductWhereClause } from "../../../modules/products/services/productPublicVisibility.server.js";

/**
 * Read-only product repository scoped to a single shop.
 *
 * Independent from the existing `productList.repository.js` so that the
 * public marketplace contract (`/api/products`) stays byte-identical.
 * We do NOT modify the existing repository or service.
 *
 * The query intentionally returns the FIRST primary image as
 * `image_url` (subquery), the first car-application brand/model,
 * and the canonical product detail link target (`productId`).
 */

const ALLOWED_SORTS = new Set([
  "newest",
  "price_asc",
  "price_desc",
]);

function buildOrderBy(sort) {
  switch (sort) {
    case "price_asc":
      return "ORDER BY (p.price IS NULL), p.price ASC, p.id DESC";
    case "price_desc":
      return "ORDER BY p.price DESC, p.id DESC";
    case "newest":
    default:
      return "ORDER BY p.createdAt DESC, p.id DESC";
  }
}

/**
 * @param {object} opts
 * @param {number} opts.shopId            REQUIRED
 * @param {number} [opts.page=1]
 * @param {number} [opts.perPage=20]
 * @param {string} [opts.q]               keyword (partName/partNumber LIKE)
 * @param {string} [opts.categorySlug]    canonical_name match
 * @param {string} [opts.brand]
 * @param {string} [opts.model]
 * @param {string|number} [opts.year]     year covered by any fitment row
 * @param {string} [opts.sort]            newest|price_asc|price_desc
 */
export async function listShopProducts({
  shopId,
  page = 1,
  perPage = 20,
  q = "",
  categorySlug = "",
  brand = "",
  model = "",
  year = "",
  sort = "newest",
} = {}) {
  if (!shopId) {
    return { items: [], page: 1, perPage, total: 0, totalPages: 0 };
  }

  const pageN = Math.max(1, Number(page) || 1);
  const limitN = Math.min(60, Math.max(1, Number(perPage) || 20));
  const offsetN = (pageN - 1) * limitN;
  const orderBy = buildOrderBy(ALLOWED_SORTS.has(sort) ? sort : "newest");

  const whereParts = ["p.shopId = ?"];
  const params = [shopId];

  if (q) {
    whereParts.push("(p.partName LIKE ? OR p.partNumber LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }

  // Join policy: join category only when filter is active (avoid duplicates from N-N map).
  //
  // Two accepted key shapes:
  //   - `c-<numeric_id>`   → filter by pc.id (used when canonical_name is NULL)
  //   - everything else     → filter by lower(canonical_name)
  // We deliberately accept both so the sidebar can keep emitting the
  // numeric form for shops whose categories haven't been backfilled.
  let categoryJoin = "";
  if (categorySlug) {
    categoryJoin = `
      LEFT JOIN product_category_map pcm ON pcm.product_id = p.id
      LEFT JOIN product_categories   pc  ON pc.id = pcm.category_id
    `;
    const raw = String(categorySlug).trim();
    const idMatch = /^c-(\d+)$/i.exec(raw);
    if (idMatch) {
      whereParts.push("pc.id = ?");
      params.push(Number(idMatch[1]));
    } else {
      whereParts.push("pc.canonical_name = ?");
      params.push(raw.toLowerCase());
    }
  }

  const yearN = Number(year);
  const hasYear = Number.isFinite(yearN) && yearN >= 1900 && yearN <= 2100;

  let fitmentJoin = "";
  if (brand || model || hasYear) {
    fitmentJoin = `
      JOIN product_car_applications pca ON pca.productId = p.id
      JOIN car_models cm                ON cm.id = pca.carModelId
    `;
    if (brand) {
      whereParts.push("LOWER(TRIM(cm.hang_xe)) = ?");
      params.push(String(brand).toLowerCase().trim());
    }
    if (model) {
      whereParts.push("LOWER(TRIM(cm.ten_xe)) = ?");
      params.push(String(model).toLowerCase().trim());
    }
    if (hasYear) {
      // Year filter: any fitment row whose [year_from, year_to] covers
      // the requested year. NULL bounds are treated as open-ended.
      whereParts.push("(pca.year_from IS NULL OR pca.year_from <= ?) AND (pca.year_to IS NULL OR pca.year_to >= ?)");
      params.push(yearN, yearN);
    }
  }

  await appendProductPublicVisibilityWhereParts(whereParts, "p", "s", {
    skipShopGate: true,
  });

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  // Whenever we joined a 1-N table (category map or fitments) we need
  // to dedup product ids. Without GROUP BY a single product with
  // multiple fitments would appear N times.
  const groupBy = categorySlug || brand || model || hasYear ? "GROUP BY p.id" : "";

  const itemsSql = `
    SELECT
      p.id,
      p.partName,
      p.partNumber,
      p.price,
      p.origin,
      p.createdAt,
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.productId = p.id
        ORDER BY pi.isPrimary DESC, pi.id ASC
        LIMIT 1
      ) AS image_url,
      (
        SELECT pc2.category_name
        FROM product_category_map pcm2
        JOIN product_categories pc2 ON pc2.id = pcm2.category_id
        WHERE pcm2.product_id = p.id
        ORDER BY pcm2.id ASC
        LIMIT 1
      ) AS categoryLabel,
      (
        SELECT cm2.hang_xe
        FROM product_car_applications pca2
        JOIN car_models cm2 ON cm2.id = pca2.carModelId
        WHERE pca2.productId = p.id
        ORDER BY pca2.id ASC
        LIMIT 1
      ) AS brandLabel,
      (
        SELECT cm3.ten_xe
        FROM product_car_applications pca3
        JOIN car_models cm3 ON cm3.id = pca3.carModelId
        WHERE pca3.productId = p.id
        ORDER BY pca3.id ASC
        LIMIT 1
      ) AS modelLabel,
      (
        SELECT pca4.year_from
        FROM product_car_applications pca4
        WHERE pca4.productId = p.id
        ORDER BY pca4.id ASC
        LIMIT 1
      ) AS yearFromFirst,
      (
        SELECT pca5.year_to
        FROM product_car_applications pca5
        WHERE pca5.productId = p.id
        ORDER BY pca5.id ASC
        LIMIT 1
      ) AS yearToFirst,
      pk.name_vi AS partTypeLabel
    FROM products p
    LEFT JOIN part_knowledge pk ON pk.id = p.part_knowledge_id
    ${categoryJoin}
    ${fitmentJoin}
    ${whereSql}
    ${groupBy}
    ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(DISTINCT p.id) AS total
    FROM products p
    ${categoryJoin}
    ${fitmentJoin}
    ${whereSql}
  `;

  const [items, [{ total } = { total: 0 }]] = await Promise.all([
    pool.query(itemsSql, [...params, limitN, offsetN]).then(([r]) => r),
    pool.query(countSql, params).then(([r]) => r),
  ]);

  return {
    items,
    page: pageN,
    perPage: limitN,
    total: Number(total) || 0,
    totalPages: Math.max(1, Math.ceil((Number(total) || 0) / limitN)),
  };
}

/**
 * Lookup helper for the shop's fitment filter panel.
 *
 * Returns the distinct brand → models map (only what THIS shop sells)
 * plus the global year range. Used to populate the dropdowns so the
 * UI never offers a brand/model that has zero products for the shop.
 *
 * Cached at the response layer (5 min) via TTL_MS.categories — the
 * payload is small and brand/model rarely change for a shop.
 */
export async function listShopFitmentOptions(shopId) {
  if (!shopId) return { brands: [], modelsByBrand: {}, years: [] };

  const visObj = await buildPublicProductWhereClause({ aliasP: "p", skipShopGate: true });
  const visSql = visObj.sql;

  const [rows] = await pool.query(
    `
      SELECT DISTINCT cm.hang_xe AS brand, cm.ten_xe AS model
      FROM products p
      JOIN product_car_applications pca ON pca.productId = p.id
      JOIN car_models cm                ON cm.id = pca.carModelId
      WHERE p.shopId = ?
      ${visSql}
      ORDER BY cm.hang_xe ASC, cm.ten_xe ASC
    `,
    [shopId],
  );

  const modelsByBrand = {};
  const brandSet = new Set();
  for (const r of rows) {
    const b = (r.brand || "").trim();
    const m = (r.model || "").trim();
    if (!b) continue;
    brandSet.add(b);
    if (!modelsByBrand[b]) modelsByBrand[b] = [];
    if (m && !modelsByBrand[b].includes(m)) modelsByBrand[b].push(m);
  }

  const [yearRows] = await pool.query(
    `
      SELECT
        MIN(pca.year_from) AS yMin,
        MAX(pca.year_to)   AS yMax
      FROM products p
      JOIN product_car_applications pca ON pca.productId = p.id
      WHERE p.shopId = ?
        AND pca.year_from IS NOT NULL
        AND pca.year_to   IS NOT NULL
        ${visSql}
    `,
    [shopId],
  );
  const yMin = Number(yearRows[0]?.yMin) || null;
  const yMax = Number(yearRows[0]?.yMax) || null;
  const years = [];
  if (yMin && yMax) {
    // Build a descending list capped to a sensible range so the
    // dropdown stays scannable (current_year .. yMin).
    const cap = Math.min(yMax, new Date().getFullYear() + 1);
    for (let y = cap; y >= yMin; y -= 1) years.push(y);
  }

  return {
    brands: Array.from(brandSet),
    modelsByBrand,
    years,
  };
}
