/**
 * SEARCH-SQL-SCALABILITY-OPTIMIZATION-01
 * HYBRID-SEARCH-ENGINE-IMPLEMENT-01 — execution layer swap (providers).
 */

import { pool } from "../../config/db.js";
import {
  buildProductListingJoinSql,
  buildListOrderBy,
} from "../../repositories/productList.repository.js";
import { getProductsColumnsResolved } from "../../utils/productsTableColumns.server.js";
import { normalizeListingQuery } from "../../utils/listingQueryNormalize.js";
import { buildSearchExecutionFilters } from "./searchExecutionLayer.js";

function cleanValue(value) {
  const s = String(value ?? "").trim();
  return s || "";
}

/**
 * @typedef {object} SearchInventoryContext
 * @property {Awaited<ReturnType<typeof getProductsColumnsResolved>>} pc
 * @property {string} keyword
 * @property {ReturnType<typeof normalizeListingQuery>} listing
 * @property {string} fromSql
 * @property {string} where
 * @property {unknown[]} params
 * @property {string} keywordOrder
 * @property {string} [searchProvider]
 */

function injectProductMetaJoin(fromSql, pc) {
  const pid = pc.idExpr("p");
  if (fromSql.includes("product_meta pm")) return fromSql;
  return fromSql.replace(
    /FROM products p/i,
    `FROM products p
    LEFT JOIN product_meta pm ON pm.product_id = ${pid}`,
  );
}

/**
 * Build shared listing context for search inventory scans.
 * @param {Record<string, unknown>} rawQuery
 * @param {string} keyword
 * @returns {Promise<SearchInventoryContext>}
 */
export async function buildSearchInventoryContext(rawQuery, keyword) {
  const pc = await getProductsColumnsResolved();
  const listing = normalizeListingQuery(rawQuery);
  const execution = await buildSearchExecutionFilters(pc, {
    ...rawQuery,
    keyword,
  });
  let fromSql = buildProductListingJoinSql(pc, {
    joinCategoryMap: true,
    joinVehicleFitment: true,
  });
  if (execution.needsProductMetaJoin) {
    fromSql = injectProductMetaJoin(fromSql, pc);
  }
  const { where, params, keywordOrder } = execution;

  return {
    pc,
    keyword,
    listing,
    fromSql,
    where,
    params,
    keywordOrder,
    searchProvider: execution.provider,
    qualityScore: execution.qualityScore,
    parityUsed: execution.parityUsed,
  };
}

const MATCHED_CTE = `
  matched AS (
    SELECT DISTINCT
      {{productId}} AS product_id,
      COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
      COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) AS canonical_slug,
      cm.hang_xe AS brand,
      cm.ten_xe AS model,
      COALESCE(pc.search_priority, 0) AS search_priority
    {{fromSql}}
    {{where}}
  )
`;

/**
 * Single inventory scan → vehicle groups + category groups (one CTE, one round-trip).
 * @param {SearchInventoryContext} ctx
 */
export async function fetchGroupedInventoryFromMatchedCte(ctx) {
  const { pc, fromSql, where, params } = ctx;
  const productId = pc.idExpr("p");

  const cte = MATCHED_CTE.replace(/\{\{productId\}\}/g, productId)
    .replace("{{fromSql}}", fromSql)
    .replace("{{where}}", where);

  const sql = `
    WITH ${cte}
    SELECT
      'vehicle' AS grain,
      canonical_name,
      canonical_slug,
      brand,
      model,
      COUNT(DISTINCT product_id) AS total_count,
      MAX(search_priority) AS search_priority
    FROM matched
    WHERE brand IS NOT NULL AND TRIM(brand) <> ''
      AND model IS NOT NULL AND TRIM(model) <> ''
    GROUP BY canonical_name, canonical_slug, brand, model
    HAVING total_count > 0
    UNION ALL
    SELECT
      'category' AS grain,
      canonical_name,
      canonical_slug,
      NULL AS brand,
      NULL AS model,
      COUNT(DISTINCT product_id) AS total_count,
      MAX(search_priority) AS search_priority
    FROM matched
    GROUP BY canonical_name, canonical_slug
    HAVING total_count > 0
  `;

  const [rows] = await pool.query(sql, params);
  const vehicleGroups = [];
  const categoryGroups = [];

  for (const row of rows) {
    const mapped = {
      canonical_name: cleanValue(row.canonical_name),
      canonical_slug: cleanValue(row.canonical_slug),
      brand: cleanValue(row.brand),
      model: cleanValue(row.model),
      total_count: Number(row.total_count) || 0,
      search_priority: Number(row.search_priority) || 0,
    };
    if (row.grain === "vehicle") {
      vehicleGroups.push(mapped);
    } else {
      categoryGroups.push(mapped);
    }
  }

  return { vehicleGroups, categoryGroups };
}

/**
 * Build OR predicate for top preview groups (category + brand + model).
 * @param {Array<{ canonical_name: string, brand?: string, model?: string }>} groups
 */
export function buildPreviewGroupOrPredicate(groups) {
  const clauses = [];
  const params = [];

  for (const g of groups) {
    clauses.push(
      `(COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) = ?
        AND LOWER(TRIM(cm.hang_xe)) = LOWER(TRIM(?))
        AND LOWER(TRIM(cm.ten_xe)) = LOWER(TRIM(?)))`,
    );
    params.push(g.canonical_name, g.brand || "", g.model || "");
  }

  return {
    sql: clauses.length ? ` AND (${clauses.join(" OR ")}) ` : "",
    params,
  };
}

/** Candidates per group — pool for JS re-sort + cross-group dedupe. */
export const PREVIEW_CANDIDATES_PER_GROUP = 12;

/**
 * One batch SQL for preview products across top groups.
 * @param {SearchInventoryContext} ctx
 * @param {Array<{ canonical_name: string, brand?: string, model?: string }>} groups
 */
export async function fetchBatchPreviewProductRows(ctx, groups) {
  if (!groups.length) return [];

  const { pc, fromSql, where, params, keywordOrder } = ctx;
  const groupFilter = buildPreviewGroupOrPredicate(groups);
  const freshnessExpr = pc.orderExprQualified("p");
  const orderSql = buildListOrderBy({
    keywordOrder,
    sort: "popular",
    freshnessExpr,
    pc,
  });
  const orderInner = orderSql.replace(/^\s*ORDER BY\s*/i, "").trim();
  const pid = pc.idExpr("p");

  const sql = `
    SELECT *
    FROM (
      SELECT
        ${pid} AS id,
        ${pc.shopIdSqlSelect("p")},
        ${pc.partNumberSqlSelect("p")},
        ${pc.nameSqlSelect("p")},
        ${pc.priceSqlSelect("p")},
        ${pc.originSqlSelect("p")},
        ${pc.stockSqlSelect("p")},
        ${freshnessExpr} AS updatedAt,
        s.name AS shopName,
        a.tinh_tp AS provinceName,
        COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
        cm.hang_xe AS brand,
        cm.ten_xe AS model,
        (
          SELECT pi.url
          FROM product_images pi
          WHERE pi.productId = ${pid}
          ORDER BY pi.isPrimary DESC, pi.id ASC
          LIMIT 1
        ) AS imageUrl,
        pf.hang_xe AS fitment_brand,
        pf.ten_xe AS fitment_model,
        pf.year_from AS fitment_year_from,
        pf.year_to AS fitment_year_to,
        pf.is_primary AS fitment_is_primary,
        ROW_NUMBER() OVER (
          PARTITION BY
            COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name),
            cm.hang_xe,
            cm.ten_xe
          ORDER BY ${orderInner}
        ) AS rn
      ${fromSql}
      LEFT JOIN LATERAL (
        SELECT
          cmf.hang_xe,
          cmf.ten_xe,
          paf.year_from,
          paf.year_to,
          paf.is_primary
        FROM product_car_applications paf
        INNER JOIN car_models cmf ON cmf.id = paf.carModelId
        WHERE paf.productId = ${pid}
        ORDER BY paf.is_primary DESC, paf.id ASC
        LIMIT 1
      ) pf ON TRUE
      ${where}
      ${groupFilter.sql}
    ) ranked
    WHERE rn <= ?
  `;

  const execParams = [...params, ...groupFilter.params, PREVIEW_CANDIDATES_PER_GROUP];
  const [rows] = await pool.query(sql, execParams);
  return rows;
}

/**
 * Slim preview candidate keys — same match/rank as batch preview, no shop/image/price SELECT.
 * Used when SEARCH_POPUP_INDEX=1 (card fields loaded from product_search_index).
 * @param {SearchInventoryContext} ctx
 * @param {Array<{ canonical_name: string, brand?: string, model?: string }>} groups
 */
export async function fetchPreviewGroupProductKeys(ctx, groups) {
  if (!groups.length) return [];

  const { pc, fromSql, where, params, keywordOrder } = ctx;
  const groupFilter = buildPreviewGroupOrPredicate(groups);
  const freshnessExpr = pc.orderExprQualified("p");
  const orderSql = buildListOrderBy({
    keywordOrder,
    sort: "popular",
    freshnessExpr,
    pc,
  });
  const orderInner = orderSql.replace(/^\s*ORDER BY\s*/i, "").trim();
  const pid = pc.idExpr("p");

  const sql = `
    SELECT *
    FROM (
      SELECT
        ${pid} AS id,
        COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
        cm.hang_xe AS brand,
        cm.ten_xe AS model,
        pa.year_from AS fitment_year_from,
        pa.year_to AS fitment_year_to,
        ROW_NUMBER() OVER (
          PARTITION BY
            COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name),
            cm.hang_xe,
            cm.ten_xe
          ORDER BY ${orderInner}
        ) AS rn
      ${fromSql}
      ${where}
      ${groupFilter.sql}
    ) ranked
    WHERE rn <= ?
  `;

  const execParams = [...params, ...groupFilter.params, PREVIEW_CANDIDATES_PER_GROUP];
  const [rows] = await pool.query(sql, execParams);
  return rows;
}
