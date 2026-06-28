/**
 * Audit-only index search execution — mirrors hybrid provider cascade on product_search_index.
 * NOT used by runtime.
 */

import { pool } from "../../backend/config/db.js";
import { getSearchEngineMode } from "../../backend/config/searchEngineConfig.js";
import { buildPublicProductWhereClause } from "../../backend/modules/products/services/productPublicVisibility.server.js";
import {
  buildKeywordRelevanceOrderSql,
  foldVi,
  normalizeSearchText,
} from "../../backend/utils/keywordRelevanceRanking.js";
import { normalizePartNumber } from "../../backend/utils/listingQueryNormalize.js";
import { resolveSearchFacets } from "../../backend/services/search/providers/searchFacetResolver.js";
import {
  assessParserRisk,
  computeQualityScore,
  decideFulltextUsage,
} from "../../backend/services/search/providers/searchQualityGate.js";
import {
  detectFulltextIndexes,
} from "../../backend/services/search/providers/fullTextSearchProvider.js";

function sqlLowerTrim(expr) {
  return `LOWER(TRIM(${expr}))`;
}

function sqlFoldVi(expr) {
  const replacements = [
    ["đ", "d"], ["à", "a"], ["á", "a"], ["ạ", "a"], ["ả", "a"], ["ã", "a"],
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

function buildIndexStructuredClause(facets, rawQuery = {}) {
  let where = "";
  const params = [];

  const cityId = facets.cityId ?? rawQuery.cityId;
  if (cityId != null) {
    const cid = Number(cityId);
    if (Number.isFinite(cid) && cid > 0) {
      where += ` AND psi.location_id = ? `;
      params.push(cid);
    }
  } else if (facets.location) {
    where += ` AND (${sqlFoldVi("psi.location_name")} LIKE ?) `;
    params.push(`%${foldVi(facets.location)}%`);
  }

  if (facets.brand) {
    where += ` AND ${sqlLowerTrim("psi.brand_name")} = ? `;
    params.push(String(facets.brand).trim().toLowerCase());
  }
  if (facets.model) {
    where += ` AND ${sqlLowerTrim("psi.model_name")} = ? `;
    params.push(String(facets.model).trim().toLowerCase());
  }
  if (facets.year != null) {
    const yearStr = String(facets.year).trim();
    if (yearStr.includes("-")) {
      const parts = yearStr.split("-").map((p) => Number(p.trim()));
      const lo = Math.min(parts[0], parts[1]);
      const hi = Math.max(parts[0], parts[1]);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        where += ` AND (psi.year_from = 0 OR psi.year_from <= ?) AND (psi.year_to = 0 OR psi.year_to >= ?) `;
        params.push(hi, lo);
      }
    } else if (Number.isFinite(Number(yearStr))) {
      const y = Number(yearStr);
      where += ` AND (psi.year_from = 0 OR psi.year_from <= ?) AND (psi.year_to = 0 OR psi.year_to >= ?) `;
      params.push(y, y);
    }
  }
  if (facets.category) {
    const cf = foldVi(facets.category);
    where += ` AND (${sqlFoldVi("psi.category_name")} LIKE ?) `;
    params.push(`%${cf}%`);
  }
  return { where, params };
}

function buildIndexExactClause(facets) {
  const partNumber = String(facets.partNumber || "").trim();
  if (!partNumber) return { where: "", params: [], keywordOrder: "", active: false };
  const normalized = normalizePartNumber(partNumber);
  const relevance = buildKeywordRelevanceOrderSql({
    titleExpr: "psi.product_name",
    partNumberExpr: "psi.part_number",
    shortDescExpr: "psi.search_text",
    descExpr: "psi.search_text",
    query: partNumber,
  });
  return {
    where: ` AND (
      REPLACE(REPLACE(LOWER(psi.part_number), '-', ''), ' ', '') = ?
      OR LOWER(TRIM(psi.part_number)) = ?
    ) `,
    params: [normalized, partNumber.toLowerCase()],
    keywordOrder: relevance ? `${relevance},` : "",
    active: true,
  };
}

function buildIndexFulltextClause(textQuery) {
  const kw = normalizeSearchText(textQuery);
  const words = kw.split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return { where: "", params: [], keywordOrder: "", active: false };
  const booleanQuery = words.map((w) => `+${w}*`).join(" ");
  const relevance = buildKeywordRelevanceOrderSql({
    titleExpr: "psi.product_name",
    partNumberExpr: "psi.part_number",
    shortDescExpr: "psi.search_text",
    descExpr: "psi.search_text",
    query: kw,
  });
  return {
    where: ` AND MATCH(psi.search_text) AGAINST (? IN BOOLEAN MODE) `,
    params: [booleanQuery],
    keywordOrder: relevance ? `${relevance},` : "",
    active: true,
  };
}

function buildIndexLikeClause(keyword) {
  const kw = foldVi(String(keyword || "").trim());
  if (!kw) return { where: "", params: [], keywordOrder: "", active: false };
  const tokens = kw.split(/\s+/).filter((t) => t.length >= 2);
  const parts = tokens.length ? tokens : [kw];
  const clauses = [];
  const params = [];
  for (const t of parts) {
    clauses.push(`(
      ${sqlFoldVi("psi.product_name")} LIKE ?
      OR ${sqlFoldVi("psi.part_number")} LIKE ?
      OR ${sqlFoldVi("psi.search_keywords")} LIKE ?
      OR ${sqlFoldVi("psi.search_text")} LIKE ?
      OR ${sqlFoldVi("psi.category_name")} LIKE ?
      OR ${sqlFoldVi("psi.brand_name")} LIKE ?
      OR ${sqlFoldVi("psi.model_name")} LIKE ?
    )`);
    const p = `%${t}%`;
    params.push(p, p, p, p, p, p, p);
  }
  const relevance = buildKeywordRelevanceOrderSql({
    titleExpr: "psi.product_name",
    partNumberExpr: "psi.part_number",
    shortDescExpr: "psi.search_text",
    descExpr: "psi.search_text",
    query: kw,
  });
  return {
    where: ` AND (${clauses.join(" AND ")}) `,
    params,
    keywordOrder: relevance ? `${relevance},` : "",
    active: true,
  };
}

async function countIndexMatches(whereClause, params) {
  const body = String(whereClause || "")
    .replace(/^\s*AND\s*/i, "")
    .trim();
  const sql = `
    SELECT COUNT(DISTINCT psi.product_id) AS c
    FROM product_search_index psi
    WHERE ${body}
  `;
  const [[row]] = await pool.query(sql, params);
  return Number(row.c) || 0;
}

/**
 * @param {Record<string, unknown>} rawQuery
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
  const tryFulltext = async () => {
    if (!fulltextReady || !fulltext.active) return null;
    const where = baseWhere + structured.where + fulltext.where;
    const params = [...structured.params, ...fulltext.params];
    const count = await countIndexMatches(where, params);
    if (count === 0) return null;
    const quality = computeQualityScore(facets, keyword, count);
    const decision = decideFulltextUsage({ risk, qualityScore: quality, strictParity: false });
    if (!decision.useFulltext) return null;
    return {
      where,
      params,
      keywordOrder: fulltext.keywordOrder,
      provider: "fulltext-index",
      qualityScore: quality,
    };
  };

  const ft = await tryFulltext();
  if (ft) return ft;

  return {
    where: baseWhere + structured.where + like.where,
    params: [...structured.params, ...like.params],
    keywordOrder: like.keywordOrder,
    provider: "like-fallback-index",
  };
}

/**
 * @param {{ where: string, params: unknown[], keywordOrder: string }} exec
 * @param {number} limit
 */
export async function fetchIndexRankedProductIds(exec, limit = 20) {
  const whereBody = exec.where.replace(/^\s*AND\s*/i, "");
  const relevanceExpr = (exec.keywordOrder || "")
    .replace(/,\s*$/g, "")
    .trim()
    .replace(/,\s*$/g, "");
  const orderScore = relevanceExpr
    ? `MIN(${relevanceExpr.replace(/,\s*$/, "")})`
    : "MIN(psi.product_id)";
  const sql = `
    SELECT product_id FROM (
      SELECT psi.product_id AS product_id, ${orderScore} AS sort_score
      FROM product_search_index psi
      WHERE ${whereBody}
      GROUP BY psi.product_id
      ORDER BY sort_score ASC, psi.product_id ASC
      LIMIT ?
    ) t
  `;
  const [rows] = await pool.query(sql, [...exec.params, limit]);
  return rows.map((r) => Number(r.product_id));
}

/**
 * @param {{ where: string, params: unknown[] }} exec
 */
export async function fetchIndexGroupedInventory(exec) {
  const whereBody = exec.where.replace(/^\s*AND\s*/i, "");
  const sql = `
    WITH matched AS (
      SELECT DISTINCT
        psi.product_id,
        psi.category_name AS canonical_name,
        pc.category_slug AS canonical_slug,
        psi.brand_name AS brand,
        psi.model_name AS model
      FROM product_search_index psi
      LEFT JOIN product_categories pc ON pc.id = psi.category_id
      WHERE ${whereBody}
    )
    SELECT 'vehicle' AS grain, canonical_name, canonical_slug, brand, model,
           COUNT(DISTINCT product_id) AS total_count
    FROM matched
    WHERE brand IS NOT NULL AND TRIM(brand) <> ''
      AND model IS NOT NULL AND TRIM(model) <> ''
    GROUP BY canonical_name, canonical_slug, brand, model
    HAVING total_count > 0
    UNION ALL
    SELECT 'category' AS grain, canonical_name, canonical_slug, NULL, NULL,
           COUNT(DISTINCT product_id) AS total_count
    FROM matched
    GROUP BY canonical_name, canonical_slug
    HAVING total_count > 0
  `;
  const [rows] = await pool.query(sql, exec.params);
  const vehicleGroups = [];
  const categoryGroups = [];
  for (const row of rows) {
    const g = {
      canonical_name: String(row.canonical_name || "").trim(),
      canonical_slug: String(row.canonical_slug || "").trim(),
      brand: row.brand ? String(row.brand).trim() : "",
      model: row.model ? String(row.model).trim() : "",
      total_count: Number(row.total_count) || 0,
    };
    if (row.grain === "vehicle") vehicleGroups.push(g);
    else categoryGroups.push(g);
  }
  return { vehicleGroups, categoryGroups };
}
