import { pool } from "../config/db.js";
import { buildListingFitmentSelectSql } from "./productList.repository.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import {
  appendProductPublicVisibilityWhereParts,
  filterPublicProductIds,
} from "../utils/productPublicVisibility.server.js";
import {
  isPresentNonEmptyFilterString,
} from "../utils/listingQueryNormalize.js";
import { appendSameRowVehicleFitmentExists } from "../utils/listingVehicleFitmentSql.js";

function normalizeText(str = "") {
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

function compatibilityLineSubselect(pc, vehicleFilters = {}) {
  return buildListingFitmentSelectSql(pc, vehicleFilters).sql.trim();
}

/** @param {ProductsSchemaAdapter} pc @param {{ brand?: string, model?: string, year?: unknown }} [vehicleFilters] */
function buildHomeCardSelectQuery(pc, vehicleFilters = {}) {
  const fitmentSelect = buildListingFitmentSelectSql(pc, vehicleFilters);
  return {
    body: homeCardSelectBody(pc, vehicleFilters),
    fitmentParams: fitmentSelect.params,
  };
}

/** @param {ProductsSchemaAdapter} pc */
function cardListSelectBody(pc) {
  const oe = `${pc.orderExprQualified("p")} AS updatedAt`;
  return `
      ${pc.idExpr("p")} AS id,
      p.shopId AS shopId,
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

/** @param {ProductsSchemaAdapter} pc @param {{ brand?: string, model?: string, year?: unknown }} [vehicleFilters] */
function homeCardSelectBody(pc, vehicleFilters = {}) {
  const oe = `${pc.orderExprQualified("p")} AS updatedAt`;
  return `
      ${pc.idExpr("p")} AS id,
      p.shopId AS shopId,
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
      ${compatibilityLineSubselect(pc, vehicleFilters)}
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
  const locationName = String(facet.city || facet.location || "").trim();

  if (facet.cityId) {
    const cid = Number(facet.cityId);
    if (Number.isFinite(cid) && cid > 0) {
      whereParts.push(` AND s.provinceId = ? `);
      params.push(cid);
    }
  } else if (locationName) {
    const locationLower = locationName.toLowerCase();
    whereParts.push(` AND (
      ${sqlLowerTrim("ap.tinh_tp")} = ?
      OR ${sqlLowerTrim("REPLACE(ap.tinh_tp, 'TP ', '')")} = ?
      OR ${sqlLowerTrim("ap.tinh_tp")} LIKE ?
    ) `);
    params.push(locationLower, locationLower, `%${locationLower}`);
  }

  appendSameRowVehicleFitmentExists(whereParts, params, pid, {
    brand,
    model,
    year,
  });

  if (isPresentNonEmptyFilterString(category)) {
    // Match category using same normalization as category controller
    const normCat = normalizeText(category);
    whereParts.push(`
      AND REPLACE(REPLACE(${pc.partNameExpr("p")}, 'đ', 'd'), 'Đ', 'd')
        REGEXP ?
    `);
    params.push(`^${normCat}(\\\\s|$)`);
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

  const fetchLimit = Math.min(limitPlusOne * 3, 200);
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
    [...params, fetchLimit],
  );

  const publicIds = new Set(await filterPublicProductIds(rows.map((r) => r.id)));
  return rows.filter((r) => publicIds.has(r.id)).slice(0, limitPlusOne);
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

  await appendProductPublicVisibilityWhereParts(whereParts, "p", "s");

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
  cityId,
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
    cityId,
    cursorUpdatedAt,
    cursorId,
  });

  await appendProductPublicVisibilityWhereParts(whereParts, "p", "s");

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

  await appendProductPublicVisibilityWhereParts(whereParts, "p", "s");

  const where = whereParts.join("");
  const { body, fitmentParams } = buildHomeCardSelectQuery(pc);
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
    [...fitmentParams, ...params, limitPlusOne],
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
  cityId,
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
    cityId,
    cursorUpdatedAt,
    cursorId,
  });

  await appendProductPublicVisibilityWhereParts(whereParts, "p", "s");

  const where = whereParts.join("");
  const vehicleFilters = { brand, model, year };
  const { body, fitmentParams } = buildHomeCardSelectQuery(pc, vehicleFilters);
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
    [...fitmentParams, ...params, limitPlusOne],
  );

  return rows;
}

export async function hydrateHomeCardsByIdsInOrder(ids, vehicleFilters = {}) {
  const clean = [...new Set((ids || []).map(Number).filter((n) => n > 0))];
  if (!clean.length) return [];

  const pc = await getProductsColumnsResolved();
  const { body, fitmentParams } = buildHomeCardSelectQuery(pc, vehicleFilters);
  const [rows] = await pool.query(
    `
    SELECT ${body}
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    LEFT JOIN address ap ON ap.id = s.provinceId
    WHERE ${pc.idExpr("p")} IN (?)
    `,
    [...fitmentParams, clean],
  );

  const publicIds = new Set(await filterPublicProductIds(clean));
  const map = new Map(rows.map((r) => [r.id, r]));
  return clean.map((id) => map.get(id)).filter((r) => r && publicIds.has(r.id));
}
