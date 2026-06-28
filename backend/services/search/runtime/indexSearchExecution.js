/**
 * SEARCH-INDEX-RUNTIME-PHASE-02 — index search execution (product_search_index only).
 * No products / fitment / category-map JOINs during search.
 */

import { pool } from "../../../config/db.js";
import { getSearchEngineMode } from "../../../config/searchEngineConfig.js";
import { isSearchMatcherIndexEnabled } from "../../../config/searchMatcherIndexConfig.js";
import { resolveSearchFacets } from "../providers/searchFacetResolver.js";
import {
  assessParserRisk,
  computeQualityScore,
  decideFulltextUsage,
} from "../providers/searchQualityGate.js";
import { detectFulltextIndexes } from "../providers/fullTextSearchProvider.js";
import { resolveMatcherExecution } from "../matcher/SearchMatcher.js";
import {
  buildIndexExactClause,
  buildIndexFulltextClause,
  buildIndexLikeClause,
  buildIndexStructuredClause,
} from "./indexSearchClauses.js";

function whereBody(exec) {
  return String(exec.where || "").replace(/^\s*AND\s*/i, "").trim();
}

async function countIndexMatches(whereClause, params) {
  const body = String(whereClause || "").replace(/^\s*AND\s*/i, "").trim();
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT psi.product_id) AS c FROM product_search_index psi WHERE ${body}`,
    params,
  );
  return Number(row.c) || 0;
}

/**
 * @typedef {object} IndexSearchExecution
 * @property {string} where
 * @property {unknown[]} params
 * @property {string} keywordOrder
 * @property {string} provider
 * @property {object} [matcherMeta]
 */

/**
 * @param {Record<string, unknown>} rawQuery
 * @returns {Promise<IndexSearchExecution>}
 */
export async function resolveIndexSearchExecution(rawQuery) {
  const keyword = String(rawQuery.keyword || rawQuery.query || rawQuery.q || "").trim();
  const mode = getSearchEngineMode();
  const baseWhere = ` AND psi.status = 'active' `;

  if (mode === "legacy") {
    const like = buildIndexLikeClause(keyword);
    return {
      where: baseWhere + like.where,
      params: [...like.params],
      keywordOrder: like.keywordOrder,
      provider: "legacy-index",
    };
  }

  if (isSearchMatcherIndexEnabled()) {
    const matcher = await resolveMatcherExecution(rawQuery, keyword);
    if (matcher) return matcher;
  }

  const facets = await resolveSearchFacets(rawQuery, keyword);
  const structured = buildIndexStructuredClause(facets, rawQuery);
  const exact = buildIndexExactClause(facets);
  const fulltextReady = await detectFulltextIndexes(pool);
  const fulltext = buildIndexFulltextClause(keyword);
  const like = buildIndexLikeClause(keyword);

  if (exact.active) {
    return {
      where: baseWhere + structured.where + exact.where,
      params: [...structured.params, ...exact.params],
      keywordOrder: exact.keywordOrder,
      provider: "exact-index",
    };
  }

  const risk = assessParserRisk(facets, keyword);
  if (fulltextReady && fulltext.active) {
    const where = baseWhere + structured.where + fulltext.where;
    const params = [...structured.params, ...fulltext.params];
    const count = await countIndexMatches(where, params);
    if (count > 0) {
      const quality = computeQualityScore(facets, keyword, count);
      const decision = decideFulltextUsage({ risk, qualityScore: quality, strictParity: false });
      if (decision.useFulltext) {
        return {
          where,
          params,
          keywordOrder: fulltext.keywordOrder,
          provider: "fulltext-index",
        };
      }
    }
  }

  return {
    where: baseWhere + structured.where + like.where,
    params: [...structured.params, ...like.params],
    keywordOrder: like.keywordOrder,
    provider: "like-fallback-index",
  };
}

function relevanceMinExpr(keywordOrder) {
  const relevanceExpr = String(keywordOrder || "")
    .replace(/,\s*$/g, "")
    .trim();
  if (!relevanceExpr) return "MIN(psi.product_id)";
  return `MIN(${relevanceExpr})`;
}

/**
 * @param {IndexSearchExecution} exec
 * @param {number} limit
 * @param {number} [offset]
 */
export async function fetchIndexRankedProductIds(exec, limit = 20, offset = 0) {
  const body = whereBody(exec);
  const orderScore = relevanceMinExpr(exec.keywordOrder);
  const [rows] = await pool.query(
    `
    SELECT product_id FROM (
      SELECT psi.product_id AS product_id, ${orderScore} AS sort_score
      FROM product_search_index psi
      WHERE ${body}
      GROUP BY psi.product_id
      ORDER BY sort_score ASC, psi.product_id ASC
      LIMIT ? OFFSET ?
    ) t
    `,
    [...exec.params, limit, offset],
  );
  return rows.map((r) => Number(r.product_id));
}

/**
 * @param {IndexSearchExecution} exec
 */
export async function countIndexMatchedProducts(exec) {
  return countIndexMatches(exec.where, exec.params);
}

/**
 * Grouped inventory from product_search_index — stable keys only (no label GROUP BY).
 * @param {IndexSearchExecution} exec
 * @param {{ stableKeys?: boolean }} [opts]
 */
export async function fetchIndexGroupedInventory(exec, opts = {}) {
  const body = whereBody(exec);
  const stableKeys = opts.stableKeys !== false;

  const sql = stableKeys
    ? `
    WITH matched AS (
      SELECT
        psi.product_id,
        psi.category_id,
        psi.category_name,
        psi.category_slug,
        psi.brand_name,
        psi.brand_slug,
        psi.model_name,
        psi.model_slug,
        psi.search_priority
      FROM product_search_index psi
      WHERE ${body}
    )
    SELECT
      'vehicle' AS grain,
      category_id,
      MAX(category_name) AS canonical_name,
      MAX(category_slug) AS canonical_slug,
      MAX(brand_name) AS brand,
      MAX(model_name) AS model,
      brand_slug,
      model_slug,
      COUNT(DISTINCT product_id) AS total_count,
      MAX(search_priority) AS search_priority
    FROM matched
    WHERE brand_slug IS NOT NULL AND TRIM(brand_slug) <> ''
      AND model_slug IS NOT NULL AND TRIM(model_slug) <> ''
    GROUP BY category_id, category_slug, brand_slug, model_slug
    HAVING total_count > 0
    UNION ALL
    SELECT
      'category' AS grain,
      category_id,
      MAX(category_name) AS canonical_name,
      MAX(category_slug) AS canonical_slug,
      NULL AS brand,
      NULL AS model,
      NULL AS brand_slug,
      NULL AS model_slug,
      COUNT(DISTINCT product_id) AS total_count,
      MAX(search_priority) AS search_priority
    FROM matched
    GROUP BY category_id, category_slug
    HAVING total_count > 0
    `
    : `
    WITH matched AS (
      SELECT DISTINCT
        psi.product_id,
        psi.category_name AS canonical_name,
        psi.canonical_slug AS canonical_slug,
        psi.brand_name AS brand,
        psi.model_name AS model,
        psi.search_priority AS search_priority
      FROM product_search_index psi
      WHERE ${body}
    )
    SELECT 'vehicle' AS grain, NULL AS category_id, canonical_name, canonical_slug, brand, model,
           NULL AS brand_slug, NULL AS model_slug,
           COUNT(DISTINCT product_id) AS total_count,
           MAX(search_priority) AS search_priority
    FROM matched
    WHERE brand IS NOT NULL AND TRIM(brand) <> ''
      AND model IS NOT NULL AND TRIM(model) <> ''
    GROUP BY canonical_name, canonical_slug, brand, model
    HAVING total_count > 0
    UNION ALL
    SELECT 'category' AS grain, NULL AS category_id, canonical_name, canonical_slug, NULL, NULL,
           NULL, NULL,
           COUNT(DISTINCT product_id) AS total_count,
           MAX(search_priority) AS search_priority
    FROM matched
    GROUP BY canonical_name, canonical_slug
    HAVING total_count > 0
    `;

  const [rows] = await pool.query(sql, exec.params);
  const vehicleGroups = [];
  const categoryGroups = [];
  for (const row of rows) {
    const mapped = {
      category_id: row.category_id != null ? Number(row.category_id) : null,
      canonical_name: String(row.canonical_name || "").trim(),
      canonical_slug: String(row.canonical_slug || "").trim(),
      brand: row.brand ? String(row.brand).trim() : "",
      model: row.model ? String(row.model).trim() : "",
      brand_slug: row.brand_slug ? String(row.brand_slug).trim() : "",
      model_slug: row.model_slug ? String(row.model_slug).trim() : "",
      total_count: Number(row.total_count) || 0,
      search_priority: Number(row.search_priority) || 0,
    };
    if (row.grain === "vehicle") vehicleGroups.push(mapped);
    else categoryGroups.push(mapped);
  }
  return { vehicleGroups, categoryGroups };
}

/**
 * @param {IndexSearchExecution} exec
 * @param {Array<{ canonical_name: string, brand?: string, model?: string }>} groups
 * @param {number} perGroup
 */
export async function fetchIndexMatchedRowsForGroups(exec, groups, perGroup = 12) {
  if (!groups.length) return [];
  const body = whereBody(exec);
  const clauses = [];
  const groupParams = [];
  for (const g of groups) {
    clauses.push(`(
      psi.category_name = ?
      AND LOWER(TRIM(psi.brand_name)) = LOWER(TRIM(?))
      AND LOWER(TRIM(psi.model_name)) = LOWER(TRIM(?))
    )`);
    groupParams.push(g.canonical_name, g.brand || "", g.model || "");
  }
  const orderScore = relevanceMinExpr(exec.keywordOrder);
  const sql = `
    SELECT product_id, canonical_name, brand, model, fitment_year_from, fitment_year_to
    FROM (
      SELECT
        g.product_id,
        g.canonical_name,
        g.brand,
        g.model,
        g.fitment_year_from,
        g.fitment_year_to,
        ROW_NUMBER() OVER (
          PARTITION BY g.canonical_name, g.brand, g.model
          ORDER BY g.sort_score ASC, g.product_id ASC
        ) AS rn
      FROM (
        SELECT
          psi.product_id,
          psi.category_name AS canonical_name,
          psi.brand_name AS brand,
          psi.model_name AS model,
          psi.year_from AS fitment_year_from,
          psi.year_to AS fitment_year_to,
          ${orderScore} AS sort_score
        FROM product_search_index psi
        WHERE ${body} AND (${clauses.join(" OR ")})
        GROUP BY psi.product_id, psi.category_name, psi.brand_name, psi.model_name,
                 psi.year_from, psi.year_to
      ) g
    ) ranked
    WHERE rn <= ?
  `;
  const [rows] = await pool.query(sql, [...exec.params, ...groupParams, perGroup]);
  return rows;
}
