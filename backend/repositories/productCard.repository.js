import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";

/**
 * @typedef {Awaited<ReturnType<typeof import("../utils/productsTableColumns.server.js").getProductsColumnsResolved>>} ProductsSchemaAdapter
 */

function thumbRawSubselect(pc) {
  return `
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.productId = ${pc.idExpr("p")}
        ORDER BY pi.isPrimary DESC, pi.id ASC
        LIMIT 1
      ) AS thumbRaw`;
}

function compatibilityLineSubselect(pc) {
  return `
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
      ) AS compatibilityLine`;
}

/** @param {ProductsSchemaAdapter} pc */
function cardListSelectBody(pc) {
  const oe = `${pc.orderExprQualified("p")} AS updatedAt`;
  return `
      ${pc.idExpr("p")} AS id,
      ${pc.slugSqlSelect("p")},
      ${pc.partNumberSqlSelect("p")},
      ${pc.nameSqlSelect("p")},
      ${pc.priceSqlSelect("p")},
      ${pc.imageSqlSelect("p")},
      ${pc.brandSqlSelect("p")},
      ${pc.statusSqlSelect("p")},
      ${thumbRawSubselect(pc)},
      s.name AS shopName,
      ap.tinh_tp AS city,
      ${oe}
  `;
}

/** @param {ProductsSchemaAdapter} pc */
function homeCardSelectBody(pc) {
  const oe = `${pc.orderExprQualified("p")} AS updatedAt`;
  return `
      ${pc.idExpr("p")} AS id,
      ${pc.slugSqlSelect("p")},
      ${pc.partNumberSqlSelect("p")},
      ${pc.nameSqlSelect("p")},
      ${pc.priceSqlSelect("p")},
      ${pc.shortDescriptionSqlSelect("p")},
      ${pc.descriptionSqlSelect("p")},
      ${pc.originSqlSelect("p")},
      ${pc.stockSqlSelect("p")},
      ${pc.imageSqlSelect("p")},
      ${pc.brandSqlSelect("p")},
      ${pc.statusSqlSelect("p")},
      s.phone,
      ${thumbRawSubselect(pc)},
      s.name AS shopName,
      ap.tinh_tp AS provinceName,
      ${oe},
      ${compatibilityLineSubselect(pc)}
  `;
}

/**
 * @param {ProductsSchemaAdapter} pc
 * @param {string} ord
 * @param {string[]} whereParts in-out
 * @param {unknown[]} params in-out
 */
function appendCardFacetFilters(whereParts, params, pc, ord, facet) {
  const { brand, model, year, category, keywordWords } = facet;
  const pid = pc.idExpr("p");

  if (brand) {
    whereParts.push(` AND EXISTS (
      SELECT 1 FROM product_car_applications pa
      INNER JOIN car_models cm ON cm.id = pa.carModelId
      WHERE pa.productId = ${pid} AND cm.hang_xe = ?
    ) `);
    params.push(brand);
  }

  if (model) {
    whereParts.push(` AND EXISTS (
      SELECT 1 FROM product_car_applications pa2
      INNER JOIN car_models cm2 ON cm2.id = pa2.carModelId
      WHERE pa2.productId = ${pid} AND cm2.ten_xe = ?
    ) `);
    params.push(model);
  }

  if (year) {
    whereParts.push(` AND EXISTS (
      SELECT 1 FROM product_car_applications pa3
      WHERE pa3.productId = ${pid}
        AND pa3.year_from <= ? AND pa3.year_to >= ?
    ) `);
    params.push(year, year);
  }

  if (category) {
    whereParts.push(`
      AND ${pc.nameNormalizedLowerExpr("p")}
        = LOWER(TRIM(REGEXP_REPLACE(?, '\\\\s+', ' ')))
    `);
    params.push(category);
  }

  const pn = pc.partNumberExpr("p");
  const title = pc.partNameExpr("p");
  const sd = pc.shortDescriptionExpr("p");
  const de = pc.descriptionExpr("p");

  for (const w of keywordWords || []) {
    const like = `%${w}%`;
    whereParts.push(`
      AND (
        LOWER(${title}) LIKE ?
        OR LOWER(${sd}) LIKE ?
        OR LOWER(${de}) LIKE ?
        OR LOWER(${pn}) LIKE ?
      )
    `);
    params.push(like, like, like, like);
  }

  if (facet.cursorUpdatedAt != null && facet.cursorId != null) {
    whereParts.push(
      ` AND (${ord} < ? OR (${ord} = ? AND ${pid} < ?)) `,
    );
    params.push(facet.cursorUpdatedAt, facet.cursorUpdatedAt, facet.cursorId);
  }
}

/**
 * Danh sách “card” từ product_list_view — không GROUP BY.
 */
export async function fetchCardsFromListView({
  limitPlusOne,
  cursorUpdatedAt,
  cursorId,
}) {
  let where = ` WHERE 1=1 `;
  const params = [];

  if (cursorUpdatedAt != null && cursorId != null) {
    where += ` AND (v.updatedAt < ? OR (v.updatedAt = ? AND v.productId < ?)) `;
    params.push(cursorUpdatedAt, cursorUpdatedAt, cursorId);
  }

  const [rows] = await pool.query(
    `
    SELECT
      v.productId AS id,
      v.slug,
      v.partNumber,
      v.partName,
      v.price,
      v.thumbnailUrl AS thumbnail,
      v.shopName,
      v.city,
      v.updatedAt
    FROM product_list_view v
    ${where}
    ORDER BY v.updatedAt DESC, v.productId DESC
    LIMIT ?
    `,
    [...params, limitPlusOne],
  );

  return rows;
}

/**
 * Danh sách “card” trực tiếp từ products + shops (+ filter EXISTS), không GROUP BY.
 */
export async function fetchCardsLiveUnfiltered({
  limitPlusOne,
  cursorUpdatedAt,
  cursorId,
}) {
  const pc = await getProductsColumnsResolved();
  const ord = pc.orderExprQualified("p");
  const whereParts = [` WHERE 1=1 `];
  const params = [];

  appendCardFacetFilters(whereParts, params, pc, ord, {
    cursorUpdatedAt,
    cursorId,
  });

  const where = whereParts.join("");
  const body = cardListSelectBody(pc);
  const [rows] = await pool.query(
    `
    SELECT ${body}
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    LEFT JOIN address ap ON ap.id = s.provinceId
    ${where}
    ORDER BY ${ord} DESC, ${pc.idExpr("p")} DESC
    LIMIT ?
    `,
    [...params, limitPlusOne],
  );

  return rows;
}

/**
 * Card list có filter (hãng / xe / năm / category / keyword) — EXISTS thay vì GROUP BY.
 */
export async function fetchCardsLiveFiltered({
  limitPlusOne,
  cursorUpdatedAt,
  cursorId,
  brand,
  model,
  year,
  category,
  keywordWords,
}) {
  const pc = await getProductsColumnsResolved();
  const ord = pc.orderExprQualified("p");
  const whereParts = [` WHERE 1=1 `];
  const params = [];

  appendCardFacetFilters(whereParts, params, pc, ord, {
    brand,
    model,
    year,
    category,
    keywordWords,
    cursorUpdatedAt,
    cursorId,
  });

  const where = whereParts.join("");
  const body = cardListSelectBody(pc);
  const [rows] = await pool.query(
    `
    SELECT ${body}
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    LEFT JOIN address ap ON ap.id = s.provinceId
    ${where}
    ORDER BY ${ord} DESC, ${pc.idExpr("p")} DESC
    LIMIT ?
    `,
    [...params, limitPlusOne],
  );

  return rows;
}

/** Trang chủ (embed=home): payload tương thích UI cũ, không GROUP BY. */
export async function fetchHomeCardsLiveUnfiltered({
  limitPlusOne,
  cursorUpdatedAt,
  cursorId,
}) {
  const pc = await getProductsColumnsResolved();
  const ord = pc.orderExprQualified("p");
  const whereParts = [` WHERE 1=1 `];
  const params = [];

  appendCardFacetFilters(whereParts, params, pc, ord, {
    cursorUpdatedAt,
    cursorId,
  });

  const where = whereParts.join("");
  const body = homeCardSelectBody(pc);
  const [rows] = await pool.query(
    `
    SELECT ${body}
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    LEFT JOIN address ap ON ap.id = s.provinceId
    ${where}
    ORDER BY ${ord} DESC, ${pc.idExpr("p")} DESC
    LIMIT ?
    `,
    [...params, limitPlusOne],
  );

  return rows;
}

export async function fetchHomeCardsLiveFiltered({
  limitPlusOne,
  cursorUpdatedAt,
  cursorId,
  brand,
  model,
  year,
  category,
  keywordWords,
}) {
  const pc = await getProductsColumnsResolved();
  const ord = pc.orderExprQualified("p");
  const whereParts = [` WHERE 1=1 `];
  const params = [];

  appendCardFacetFilters(whereParts, params, pc, ord, {
    brand,
    model,
    year,
    category,
    keywordWords,
    cursorUpdatedAt,
    cursorId,
  });

  const where = whereParts.join("");
  const body = homeCardSelectBody(pc);
  const [rows] = await pool.query(
    `
    SELECT ${body}
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    LEFT JOIN address ap ON ap.id = s.provinceId
    ${where}
    ORDER BY ${ord} DESC, ${pc.idExpr("p")} DESC
    LIMIT ?
    `,
    [...params, limitPlusOne],
  );

  return rows;
}

export async function hydrateHomeCardsByIdsInOrder(ids) {
  const clean = [...new Set((ids || []).map(Number).filter((n) => n > 0))];
  if (!clean.length) return [];

  const pc = await getProductsColumnsResolved();
  const body = homeCardSelectBody(pc);
  const [rows] = await pool.query(
    `
    SELECT ${body}
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    LEFT JOIN address ap ON ap.id = s.provinceId
    WHERE ${pc.idExpr("p")} IN (?)
    `,
    [clean],
  );

  const map = new Map(rows.map((r) => [r.id, r]));
  return clean.map((id) => map.get(id)).filter(Boolean);
}
