import mysql from "mysql2";
import { pool } from "../config/db.js";

export function normalizeText(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * @typedef {Awaited<ReturnType<typeof import("../utils/productsTableColumns.server.js").getProductsColumnsResolved>>} ProductsSchemaAdapter
 */

/**
 * @param {ProductsSchemaAdapter} pc
 * @returns {{ where: string, params: unknown[], keywordOrder: string }}
 */
export function buildProductListFilters(pc, query) {
  const { brand, model, year, category, keyword } = query;

  let where = ` WHERE 1=1 `;
  const params = [];

  if (brand) {
    where += ` AND cm.hang_xe = ? `;
    params.push(brand);
  }

  if (model) {
    where += ` AND cm.ten_xe = ? `;
    params.push(model);
  }

  if (year) {
    where += ` AND pa.year_from <= ? AND pa.year_to >= ? `;
    params.push(year, year);
  }

  if (category) {
    where += `
        AND ${pc.nameNormalizedLowerExpr("p")}
          = LOWER(TRIM(REGEXP_REPLACE(?, '\\\\s+', ' ')))
      `;
    params.push(category);
  }

  let keywordOrder = "";

  if (keyword) {
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
}) {
  const freshnessExpr = pc.orderExprQualified("p");
  const orderSql = buildListOrderBy({ keywordOrder, sort, freshnessExpr, pc });
  const [rows] = await pool.query(
    `
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
            INNER JOIN car_models cmx ON cmx.id = pax.carModelId
            WHERE pax.productId = ${pc.idExpr("p")}
            ORDER BY pax.id ASC
            LIMIT 1
          ) AS compatibilityLine

        FROM products p
        LEFT JOIN product_car_applications pa
          ON pa.productId = ${pc.idExpr("p")}
        LEFT JOIN car_models cm
          ON cm.id = pa.carModelId
        JOIN shops s
          ON ${pc.shopJoinOn("p", "s")}
        LEFT JOIN address a
          ON a.id = s.provinceId

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
        `,
    [...params, limit, offset],
  );
  return rows;
}

/**
 * @param {{ pc: ProductsSchemaAdapter, where: string, params: unknown[] }} args
 */
export async function countProductList({ pc, where, params }) {
  const pid = pc.idExpr("p");
  const [[countRow]] = await pool.query(
    `
      SELECT COUNT(DISTINCT ${pid}) total
      FROM products p
      LEFT JOIN product_car_applications pa ON pa.productId = ${pid}
      LEFT JOIN car_models cm ON cm.id = pa.carModelId
      ${where}
      `,
    params,
  );
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
