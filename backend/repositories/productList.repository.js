import mysql from "mysql2";
import { pool } from "../config/db.js";
import { normalizeListingQuery } from "../utils/listingQueryNormalize.js";

export function normalizeText(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sqlLowerTrim(expr) {
  return `LOWER(TRIM(${expr}))`;
}

function sqlFoldVi(expr) {
  const replacements = [
    ["đ", "d"],
    ["à", "a"], ["á", "a"], ["ạ", "a"], ["ả", "a"], ["ã", "a"],
    ["â", "a"], ["ầ", "a"], ["ấ", "a"], ["ậ", "a"], ["ẩ", "a"], ["ẫ", "a"],
    ["ă", "a"], ["ằ", "a"], ["ắ", "a"], ["ặ", "a"], ["ẳ", "a"], ["ẵ", "a"],
    ["è", "e"], ["é", "e"], ["ẹ", "e"], ["ẻ", "e"], ["ẽ", "e"],
    ["ê", "e"], ["ề", "e"], ["ế", "e"], ["ệ", "e"], ["ể", "e"], ["ễ", "e"],
    ["ì", "i"], ["í", "i"], ["ị", "i"], ["ỉ", "i"], ["ĩ", "i"],
    ["ò", "o"], ["ó", "o"], ["ọ", "o"], ["ỏ", "o"], ["õ", "o"],
    ["ô", "o"], ["ồ", "o"], ["ố", "o"], ["ộ", "o"], ["ổ", "o"], ["ỗ", "o"],
    ["ơ", "o"], ["ờ", "o"], ["ớ", "o"], ["ợ", "o"], ["ở", "o"], ["ỡ", "o"],
    ["ù", "u"], ["ú", "u"], ["ụ", "u"], ["ủ", "u"], ["ũ", "u"],
    ["ư", "u"], ["ừ", "u"], ["ứ", "u"], ["ự", "u"], ["ử", "u"], ["ữ", "u"],
    ["ỳ", "y"], ["ý", "y"], ["ỵ", "y"], ["ỷ", "y"], ["ỹ", "y"],
  ];
  return replacements.reduce(
    (acc, [from, to]) => `REPLACE(${acc}, '${from}', '${to}')`,
    `LOWER(TRIM(${expr}))`,
  );
}

function foldVi(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * @typedef {Awaited<ReturnType<typeof import("../utils/productsTableColumns.server.js").getProductsColumnsResolved>>} ProductsSchemaAdapter
 */

/**
 * From-clause for home listing (pcm/pc + optional fitment + shop + address).
 * Omit fitment joins when WHERE does not reference pa/cm (category-only, keyword-only, etc.).
 * @param {ProductsSchemaAdapter} pc
 * @param {boolean} joinVehicleFitment
 */
export function buildProductListingJoinSql(pc) {
  const pid = pc.idExpr("p");

  return `
    FROM products p

    JOIN product_category_map pcm
      ON pcm.product_id = ${pid}

    JOIN product_categories pc
      ON pc.id = pcm.category_id

    LEFT JOIN product_car_applications pa
      ON pa.productId = ${pid}

    LEFT JOIN car_models cm
      ON cm.id = pa.carModelId

    JOIN shops s
      ON ${pc.shopJoinOn("p", "s")}

    LEFT JOIN address a
      ON a.id = s.provinceId
  `;
}

/**
 * From-clause for /locations/filtered — must mirror tables referenced in buildProductListFilters WHERE.
 * @param {ProductsSchemaAdapter} pc
 * @param {{ joinCategoryMap: boolean, joinVehicleFitment: boolean }} o
 */
export function buildLocationFilteredFromSql(pc, o) {
  const pid = pc.idExpr("p");

  let sql = `
    FROM address a

    INNER JOIN shops s
      ON s.provinceId = a.id

    INNER JOIN products p
      ON p.shopId = s.id

    JOIN product_category_map pcm
      ON pcm.product_id = ${pid}

    JOIN product_categories pc
      ON pc.id = pcm.category_id

    LEFT JOIN product_car_applications pa
      ON pa.productId = ${pid}

    LEFT JOIN car_models cm
      ON cm.id = pa.carModelId
  `;

  return sql;
}

/**
 * @param {ProductsSchemaAdapter} pc
 * @returns {{ where: string, params: unknown[], keywordOrder: string }}
 */
export function buildProductListFilters(pc, query) {
  const q = normalizeListingQuery(query || {});
  const { brand, model, year, category, keyword, cityId, city, location } = q;
  const locationName = String(city || location || "").trim();

  let where = ` WHERE 1=1 `;
  const params = [];

  if (cityId != null) {
    const cid = Number(cityId);
    if (Number.isFinite(cid) && cid > 0) {
      where += ` AND s.provinceId = ? `;
      params.push(cid);
    }
  } else if (locationName) {
    const locationFolded = foldVi(locationName); // ha noi

    where += ` AND (
    ${sqlFoldVi("a.tinh_tp")} LIKE ?
  ) `;

    params.push(`%${locationFolded}%`);
  }

  if (brand) {
    where += ` AND ${sqlLowerTrim("cm.hang_xe")} = ? `;
    params.push(String(brand).trim().toLowerCase());
  }

  if (model) {
    where += ` AND ${sqlLowerTrim("cm.ten_xe")} = ? `;
    params.push(String(model).trim().toLowerCase());
  }

  if (year != null && Number.isFinite(Number(year))) {
    const y = Number(year);
    where += `
      AND (
        (pa.year_from IS NULL OR pa.year_from <= ?)
        AND
        (pa.year_to IS NULL OR pa.year_to >= ?)
      )
    `;
    params.push(y, y);
  }

  let keywordOrder = "";

  if (category) {
    const categoryFolded = foldVi(category);

    where += ` AND (
      ${sqlFoldVi("pc.category_name")} LIKE ?
      OR (
        NULLIF(TRIM(pc.canonical_name), '') IS NOT NULL
        AND ${sqlFoldVi("pc.canonical_name")} LIKE ?
      )
    ) `;

    params.push(
      `%${categoryFolded}%`,
      `%${categoryFolded}%`
    );
  } if (keyword) {
    const kw = normalizeText(keyword);
    const words = kw.split(/\s+/).filter(Boolean);

    if (words.length) {
      const pn = pc.partNumberExpr("p");
      const title = pc.partNameExpr("p");
      const sd = pc.shortDescriptionExpr("p");
      const de = pc.descriptionExpr("p");

      words.forEach((w) => {
        where += `
          AND (
            LOWER(${title}) LIKE ?
            OR LOWER(${sd}) LIKE ?
            OR LOWER(${de}) LIKE ?
            OR LOWER(${pn}) LIKE ?
          )
          `;
        const like = `%${w}%`;
        params.push(like, like, like, like);
      });

      const escKwLike = mysql.escape(`%${kw}%`);
      keywordOrder = `
          CASE
            WHEN LOWER(${title}) LIKE ${escKwLike} THEN 1
            WHEN LOWER(${sd}) LIKE ${escKwLike} THEN 2
            WHEN LOWER(${de}) LIKE ${escKwLike} THEN 3
            ELSE 9
          END,
        `;
    }
  }

  return { where, params, keywordOrder };
}

const LIST_SORT = new Set(["popular", "newest", "price_asc", "price_desc"]);

/**
 * @param {{ keywordOrder: string, sort?: string, freshnessExpr: string, pc: ProductsSchemaAdapter }} opts
 */
export function buildListOrderBy({ keywordOrder, sort, freshnessExpr, pc }) {
  const s = LIST_SORT.has(String(sort || "").toLowerCase())
    ? String(sort).toLowerCase()
    : "popular";

  const pn = pc.partNumberExpr("p");
  const pr = pc.priceExpr("p");
  const pid = pc.idExpr("p");

  const popularTail = `
          CASE
            WHEN ${pn} IS NOT NULL
            AND ${pn} <> ''
            THEN 0 ELSE 1
          END,
          CASE
            WHEN ${pr} > 0
            THEN 0 ELSE 1
          END,
          MOD(DAY(NOW()) + ${pid}, 7),
          ${freshnessExpr} DESC`;

  const tail =
    s === "newest"
      ? `${freshnessExpr} DESC, ${pid} DESC`
      : s === "price_asc"
        ? `CASE WHEN ${pr} IS NULL OR ${pr} <= 0 THEN 1 ELSE 0 END, ${pr} ASC, ${pid} DESC`
        : s === "price_desc"
          ? `CASE WHEN ${pr} IS NULL OR ${pr} <= 0 THEN 1 ELSE 0 END, ${pr} DESC, ${pid} DESC`
          : popularTail;

  return `
        ORDER BY
          ${keywordOrder}
          ${tail}
        `;
}

/**
 * @param {object} args
 * @param {ProductsSchemaAdapter} args.pc
 */
export async function selectProductListRows({
  pc,
  where,
  params,
  keywordOrder,
  limit,
  offset,
  sort = "popular",
  joinVehicleFitment = false,
}) {
  const freshnessExpr = pc.orderExprQualified("p");
  const orderSql = buildListOrderBy({ keywordOrder, sort, freshnessExpr, pc });
  const fromSql = buildProductListingJoinSql(pc);
  const sql = `
        SELECT
          ${pc.idExpr("p")},
          ${pc.shopIdSqlSelect("p")},
          ${pc.partNumberSqlSelect("p")},
          ${pc.nameSqlSelect("p")},
          ${pc.priceSqlSelect("p")},
          ${pc.shortDescriptionSqlSelect("p")},
          ${pc.descriptionSqlSelect("p")},
          ${pc.originSqlSelect("p")},
          ${pc.stockSqlSelect("p")},
          ${freshnessExpr} AS updatedAt,
          MAX(s.name) AS shopName,
          MAX(s.phone) AS phone,
          MAX(a.tinh_tp) AS provinceName,
          (
            SELECT TRIM(BOTH ' ' FROM CONCAT_WS(' ',
              NULLIF(TRIM(cmx.hang_xe), ''),
              NULLIF(TRIM(cmx.ten_xe), ''),
              NULLIF(
                IF(
                  pax.year_from IS NULL OR pax.year_to IS NULL,
                  NULL,
                  IF(
                    pax.year_from = pax.year_to,
                    CAST(pax.year_from AS CHAR),
                    CONCAT(pax.year_from, '–', pax.year_to)
                  )
                ),
                ''
              )
            ))
            FROM product_car_applications pax
            LEFT JOIN car_models cmx ON cmx.id = pax.carModelId
            WHERE pax.productId = ${pc.idExpr("p")}
            ORDER BY pax.id ASC
            LIMIT 1
          ) AS compatibilityLine

        ${fromSql}

        ${where}

        GROUP BY
          ${pc.idExpr("p")}, ${pc.shopIdExpr("p")}, ${pc.partNumberExpr("p")}, ${pc.partNameExpr("p")},
          ${pc.priceExpr("p")},
          ${pc.shortDescriptionExpr("p")}, ${pc.descriptionExpr("p")},
          ${pc.originExpr("p")},
          ${pc.stockExpr("p")},
          ${freshnessExpr}

        ${orderSql}

        LIMIT ? OFFSET ?
        `;
  const execParams = [...params, limit, offset];
  if (process.env.LOG_LISTING_SQL === "1") {
    console.log(
      "[listing SQL] /products selectProductListRows",
      JSON.stringify({ joinVehicleFitment }),
      sql.replace(/\s+/g, " ").trim(),
      execParams,
    );
  }
  const [rows] = await pool.query(sql, execParams);
  return rows;
}

/**
 * @param {{ pc: ProductsSchemaAdapter, where: string, params: unknown[] }} args
 */
export async function countProductList({ pc, where, params, joinVehicleFitment = false }) {
  const pid = pc.idExpr("p");
  const fromSql = buildProductListingJoinSql(pc);
  const sql = `
      SELECT COUNT(DISTINCT ${pid}) total
      ${fromSql}
      ${where}
      `;
  if (process.env.LOG_LISTING_SQL === "1") {
    console.log(
      "[listing SQL] /products countProductList",
      JSON.stringify({ joinVehicleFitment }),
      sql.replace(/\s+/g, " ").trim(),
      params,
    );
  }
  const [[countRow]] = await pool.query(sql, params);
  return countRow;
}

export async function selectPrimaryImagesForProducts(productIds) {
  if (!productIds.length) {
    return [];
  }
  const [images] = await pool.query(
    `
      SELECT productId, url
      FROM product_images
      WHERE productId IN (?)
      ORDER BY isPrimary DESC, id ASC
      `,
    [productIds],
  );
  return images;
}

/**
 * @param {ProductsSchemaAdapter} pc
 */
export async function selectBrandsWithCounts(pc) {
  const pid = pc.idExpr("p");
  const [rows] = await pool.query(`
      SELECT
        cm.hang_xe,
        COUNT(DISTINCT ${pid}) AS total
      FROM products p
      JOIN product_car_applications pa ON pa.productId = ${pid}
      JOIN car_models cm ON cm.id = pa.carModelId
      GROUP BY cm.hang_xe
      ORDER BY total DESC, cm.hang_xe ASC
    `);
  return rows;
}

/**
 * @param {ProductsSchemaAdapter} pc
 */
export async function selectModelsWithCounts(pc, brand) {
  const pid = pc.idExpr("p");
  const [rows] = await pool.query(
    `
      SELECT
        cm.ten_xe,
        COUNT(DISTINCT ${pid}) AS total
      FROM products p
      JOIN product_car_applications pa ON pa.productId = ${pid}
      JOIN car_models cm ON cm.id = pa.carModelId
      WHERE cm.hang_xe = ?
      GROUP BY cm.ten_xe
      ORDER BY total DESC, cm.ten_xe ASC
      `,
    [brand],
  );
  return rows;
}

export async function selectLocationsWithCounts(pc, query) {
  const q = normalizeListingQuery(query);

  const joinVehicleFitment =
    q.brand || q.model || (q.year != null);

  const joinCategoryMap = true;

  const { where, params } =
    buildProductListFilters(pc, query);

  const fromSql = buildLocationFilteredFromSql(pc, {
    joinCategoryMap,
    joinVehicleFitment,
  });

  const sql = `
    SELECT
      a.id,
      a.tinh_tp,
      COUNT(DISTINCT ${pc.idExpr("p")}) AS total
    ${fromSql}
    ${where}
    GROUP BY a.id, a.tinh_tp
    ORDER BY total DESC
  `;

  const [rows] = await pool.query(sql, params);
  return rows.map(r => ({
    id: r.id,
    name: r.tinh_tp,
    slug: foldVi(r.tinh_tp).replace(/\s+/g, "-"),
    productCount: Number(r.total)
  }));
}