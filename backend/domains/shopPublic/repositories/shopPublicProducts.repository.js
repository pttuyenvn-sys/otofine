import { pool } from "../../../config/db.js";

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
 * @param {number} [opts.perPage=16]
 * @param {string} [opts.q]               keyword (partName/partNumber LIKE)
 * @param {string} [opts.categorySlug]    canonical_name match
 * @param {string} [opts.brand]
 * @param {string} [opts.model]
 * @param {string} [opts.sort]            newest|price_asc|price_desc
 */
export async function listShopProducts({
  shopId,
  page = 1,
  perPage = 16,
  q = "",
  categorySlug = "",
  brand = "",
  model = "",
  sort = "newest",
} = {}) {
  if (!shopId) {
    return { items: [], page: 1, perPage, total: 0, totalPages: 0 };
  }

  const pageN = Math.max(1, Number(page) || 1);
  const limitN = Math.min(60, Math.max(1, Number(perPage) || 16));
  const offsetN = (pageN - 1) * limitN;
  const orderBy = buildOrderBy(ALLOWED_SORTS.has(sort) ? sort : "newest");

  const whereParts = ["p.shopId = ?"];
  const params = [shopId];

  if (q) {
    whereParts.push("(p.partName LIKE ? OR p.partNumber LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }

  // Join policy: join category only when filter is active (avoid duplicates from N-N map).
  let categoryJoin = "";
  if (categorySlug) {
    categoryJoin = `
      JOIN product_category_map pcm ON pcm.product_id = p.id
      JOIN product_categories   pc  ON pc.id = pcm.category_id
    `;
    whereParts.push("pc.canonical_name = ?");
    params.push(String(categorySlug).toLowerCase());
  }

  let fitmentJoin = "";
  if (brand || model) {
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
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const groupBy = categorySlug || brand || model ? "GROUP BY p.id" : "";

  const itemsSql = `
    SELECT
      p.id,
      p.partName,
      p.partNumber,
      p.price,
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
      ) AS brandLabel
    FROM products p
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
