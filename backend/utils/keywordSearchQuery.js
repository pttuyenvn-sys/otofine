/**
 * Staged keyword search — exact → prefix → fuzzy (%LIKE%) with weighted relevance.
 * Shared by marketplace listing and MySQL search fallback.
 */

import { pool } from "../config/db.js";
import {
  isStrictSkuKeyword,
  normalizePartNumber,
} from "./listingQueryNormalize.js";
import { normalizeText } from "../repositories/productList.repository.js";

/** Max cards returned for strict SKU searches (limits image fan-out). */
export const STRICT_SKU_MAX_RESULTS = 8;

/**
 * @param {string} keyword
 */
export function parseKeywordIntent(keyword) {
  const raw = String(keyword || "").trim();
  const normalized = normalizeText(raw);
  const words = normalized.split(/\s+/).filter(Boolean);
  const phraseLower = normalized;
  const partNorm = normalizePartNumber(raw);
  const strictSku = isStrictSkuKeyword(raw);
  const skuLike =
    strictSku ||
    (partNorm.length >= 3 &&
      (/[0-9]/.test(partNorm) || /^[a-z0-9]{5,}$/i.test(partNorm.replace(/-/g, ""))));

  return {
    raw,
    normalized,
    words,
    phraseLower,
    partNorm,
    strictSku,
    skuLike,
    singleToken: words.length === 1,
  };
}

/**
 * Weighted relevance score (higher = better). Uses bound params only.
 * @param {import("../utils/productsTableColumns.server.js").getProductsColumnsResolved extends () => Promise<infer T> ? T : never} pc
 * @param {ReturnType<typeof parseKeywordIntent>} intent
 */
export function buildKeywordRelevanceScoreSql(pc, intent) {
  const pn = pc.partNumberExpr("p");
  const pnNorm = `REPLACE(REPLACE(LOWER(${pn}), '-', ''), ' ', '')`;
  const title = pc.partNameExpr("p");
  const sd = pc.shortDescriptionExpr("p");
  const de = pc.descriptionExpr("p");

  /** @type {string[]} */
  const parts = [];
  /** @type {unknown[]} */
  const params = [];

  if (intent.partNorm.length >= 2) {
    parts.push(`CASE WHEN ${pnNorm} = ? THEN 100 ELSE 0 END`);
    params.push(intent.partNorm);
  }

  parts.push(`CASE WHEN LOWER(TRIM(${pn})) = ? THEN 95 ELSE 0 END`);
  params.push(intent.phraseLower);

  if (intent.strictSku) {
    if (intent.words.length) {
      const w0 = intent.words[0];
      parts.push(`CASE WHEN LOWER(${pn}) LIKE ? THEN 50 ELSE 0 END`);
      params.push(`${w0}%`);
      parts.push(`CASE WHEN ${pnNorm} LIKE ? THEN 48 ELSE 0 END`);
      params.push(`${intent.partNorm}%`);
    }
    return {
      expr: parts.length ? `GREATEST(${parts.join(", ")})` : "0",
      params,
    };
  }

  parts.push(`CASE WHEN LOWER(TRIM(${title})) = ? THEN 80 ELSE 0 END`);
  params.push(intent.phraseLower);

  if (intent.words.length) {
    const w0 = intent.words[0];
    parts.push(`CASE WHEN LOWER(${title}) LIKE ? THEN 60 ELSE 0 END`);
    params.push(`${w0}%`);
    parts.push(`CASE WHEN LOWER(${pn}) LIKE ? THEN 50 ELSE 0 END`);
    params.push(`${w0}%`);
    parts.push(`CASE WHEN LOWER(${sd}) LIKE ? THEN 40 ELSE 0 END`);
    params.push(`${w0}%`);
  }

  if (intent.phraseLower) {
    const fuzzyPhrase = `%${intent.phraseLower}%`;
    parts.push(`CASE WHEN LOWER(${title}) LIKE ? THEN 20 ELSE 0 END`);
    params.push(fuzzyPhrase);
    parts.push(`CASE WHEN LOWER(${pn}) LIKE ? THEN 18 ELSE 0 END`);
    params.push(fuzzyPhrase);
    parts.push(`CASE WHEN LOWER(${sd}) LIKE ? THEN 15 ELSE 0 END`);
    params.push(fuzzyPhrase);
    parts.push(`CASE WHEN LOWER(${de}) LIKE ? THEN 10 ELSE 0 END`);
    params.push(fuzzyPhrase);
  }

  for (const w of intent.words) {
    const like = `%${w}%`;
    parts.push(`CASE WHEN LOWER(${title}) LIKE ? THEN 20 ELSE 0 END`);
    params.push(like);
    parts.push(`CASE WHEN LOWER(${pn}) LIKE ? THEN 18 ELSE 0 END`);
    params.push(like);
    parts.push(`CASE WHEN LOWER(${sd}) LIKE ? THEN 15 ELSE 0 END`);
    params.push(like);
    parts.push(`CASE WHEN LOWER(${de}) LIKE ? THEN 10 ELSE 0 END`);
    params.push(like);
  }

  return {
    expr: parts.length ? `GREATEST(${parts.join(", ")})` : "0",
    params,
  };
}

/**
 * @param {import("../utils/productsTableColumns.server.js").getProductsColumnsResolved extends () => Promise<infer T> ? T : never} pc
 * @param {ReturnType<typeof parseKeywordIntent>} intent
 * @param {"exact"|"prefix"|"fuzzy"} stage
 */
export function buildKeywordStageMatchSql(pc, intent, stage) {
  const pn = pc.partNumberExpr("p");
  const pnNorm = `REPLACE(REPLACE(LOWER(${pn}), '-', ''), ' ', '')`;
  const title = pc.partNameExpr("p");
  const sd = pc.shortDescriptionExpr("p");
  const de = pc.descriptionExpr("p");

  /** @type {unknown[]} */
  const params = [];

  if (intent.strictSku) {
    if (stage === "fuzzy") return { sql: "0", params: [] };

    if (stage === "exact") {
      /** @type {string[]} */
      const exactParts = [];
      if (intent.partNorm.length >= 2) {
        exactParts.push(`${pnNorm} = ?`);
        params.push(intent.partNorm);
      }
      exactParts.push(`LOWER(TRIM(${pn})) = ?`);
      params.push(intent.phraseLower);
      exactParts.push(`LOWER(TRIM(${pn})) = ?`);
      params.push(String(intent.raw).toLowerCase().trim());
      return { sql: `(${exactParts.join(" OR ")})`, params };
    }

    if (stage === "prefix" && intent.words.length) {
      const w0 = intent.words[0];
      params.push(`${w0}%`, `${intent.partNorm}%`);
      return {
        sql: `(LOWER(${pn}) LIKE ? OR ${pnNorm} LIKE ?)`,
        params,
      };
    }

    return { sql: "0", params: [] };
  }

  if (stage === "exact") {
    /** @type {string[]} */
    const exactParts = [];
    if (intent.partNorm.length >= 2) {
      exactParts.push(`${pnNorm} = ?`);
      params.push(intent.partNorm);
    }
    exactParts.push(`LOWER(TRIM(${pn})) = ?`);
    params.push(intent.phraseLower);
    exactParts.push(`LOWER(TRIM(${title})) = ?`);
    params.push(intent.phraseLower);
    return { sql: `(${exactParts.join(" OR ")})`, params };
  }

  if (stage === "prefix") {
    if (!intent.words.length) return { sql: "0", params: [] };
    const wordClauses = intent.words.map((w) => {
      const prefix = `${w}%`;
      params.push(prefix, prefix, prefix);
      return `(
        LOWER(${title}) LIKE ?
        OR LOWER(${pn}) LIKE ?
        OR LOWER(${sd}) LIKE ?
      )`;
    });
    return { sql: wordClauses.join(" AND "), params };
  }

  if (!intent.words.length) return { sql: "0", params: [] };
  const fuzzyClauses = intent.words.map((w) => {
    const like = `%${w}%`;
    params.push(like, like, like, like);
    return `(
      LOWER(${title}) LIKE ?
      OR LOWER(${sd}) LIKE ?
      OR LOWER(${de}) LIKE ?
      OR LOWER(${pn}) LIKE ?
    )`;
  });
  return { sql: fuzzyClauses.join(" AND "), params };
}

/**
 * @param {import("../utils/productsTableColumns.server.js").getProductsColumnsResolved extends () => Promise<infer T> ? T : never} pc
 * @param {string} sort
 */
function buildKeywordDiscoveryOrderSql(pc, sort) {
  const freshnessExpr = pc.orderExprQualified("p");
  const pid = pc.idExpr("p");
  const pr = pc.priceExpr("p");
  const s = String(sort || "popular").toLowerCase();

  if (s === "newest") {
    return `${freshnessExpr} DESC, ${pid} DESC`;
  }
  if (s === "price_asc") {
    return `CASE WHEN ${pr} IS NULL OR ${pr} <= 0 THEN 1 ELSE 0 END, ${pr} ASC, ${pid} DESC`;
  }
  if (s === "price_desc") {
    return `CASE WHEN ${pr} IS NULL OR ${pr} <= 0 THEN 1 ELSE 0 END, ${pr} DESC, ${pid} DESC`;
  }
  const pn = pc.partNumberExpr("p");
  return `
    CASE WHEN ${pn} IS NOT NULL AND ${pn} <> '' THEN 0 ELSE 1 END,
    CASE WHEN ${pr} > 0 THEN 0 ELSE 1 END,
    ${freshnessExpr} DESC,
    ${pid} DESC
  `;
}

/**
 * Staged ID discovery: exact → prefix → fuzzy until offset+limit IDs collected.
 */
export async function discoverKeywordProductIds({
  pc,
  intent,
  baseWhere,
  baseParams,
  joinVehicleFitment = false,
  joinCategoryMap = false,
  limit,
  offset,
  sort = "popular",
  fromSqlBuilder,
}) {
  const limitN = Math.max(1, Number(limit) || 16);
  const offsetN = Math.max(0, Number(offset) || 0);
  const pageCap = intent.strictSku
    ? Math.min(limitN, Math.max(0, STRICT_SKU_MAX_RESULTS - offsetN))
    : limitN;
  const need = offsetN + pageCap;
  const { expr: scoreExpr, params: scoreParams } = buildKeywordRelevanceScoreSql(
    pc,
    intent,
  );
  const orderTail = buildKeywordDiscoveryOrderSql(pc, sort);
  const pid = pc.idExpr("p");
  const fromSql = fromSqlBuilder(pc, { joinVehicleFitment, joinCategoryMap });
  const needsGroup = joinVehicleFitment || joinCategoryMap;

  if (intent.strictSku && pageCap <= 0) {
    return [];
  }

  /** @type {Map<number, number>} */
  const ranked = new Map();

  /** @type {("exact"|"prefix"|"fuzzy")[]} */
  const stages = intent.strictSku
    ? ["exact", "prefix"]
    : intent.skuLike
      ? ["exact", "prefix", "fuzzy"]
      : ["prefix", "exact", "fuzzy"];

  for (const stage of stages) {
    if (intent.strictSku && ranked.size >= need) break;
    if (intent.skuLike && !intent.strictSku && ranked.size >= need) break;

    const stageMatch = buildKeywordStageMatchSql(pc, intent, stage);
    if (stageMatch.sql === "0") continue;

    const excludeIds = [...ranked.keys()];
    let excludeSql = "";
    /** @type {unknown[]} */
    const excludeParams = [];
    if (excludeIds.length) {
      excludeSql = ` AND ${pid} NOT IN (?) `;
      excludeParams.push(excludeIds);
    }

    const fetchLimit = intent.strictSku
      ? need - ranked.size
      : need - ranked.size + 8;
    const groupSql = needsGroup ? `GROUP BY ${pid}` : "";
    const scoreSelect = needsGroup ? `MAX(${scoreExpr})` : scoreExpr;

    const sql = `
      SELECT ${pid} AS id, ${scoreSelect} AS rel_score
      ${fromSql}
      ${baseWhere}
      AND (${stageMatch.sql})
      ${excludeSql}
      ${groupSql}
      ORDER BY rel_score DESC, ${orderTail}
      LIMIT ?
    `;

    const queryParams = [
      ...scoreParams,
      ...baseParams,
      ...stageMatch.params,
      ...excludeParams,
      Math.max(1, fetchLimit),
    ];

    if (process.env.LOG_LISTING_SQL === "1") {
      console.log(
        "[keywordSearch] stage",
        stage,
        intent.strictSku ? "strictSku" : "",
        sql.replace(/\s+/g, " ").trim(),
        queryParams,
      );
    }

    const [rows] = await pool.query(sql, queryParams);
    for (const row of rows) {
      const id = Number(row.id);
      const rel = Number(row.rel_score) || 0;
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!ranked.has(id)) ranked.set(id, rel);
    }

    if (intent.strictSku && ranked.size > 0 && stage === "exact") {
      break;
    }

    if (intent.strictSku && stage === "prefix") {
      break;
    }

    // SKU-like (non-strict): never broaden to fuzzy once exact/prefix hit.
    if (intent.skuLike && !intent.strictSku && ranked.size > 0 && (stage === "exact" || stage === "prefix")) {
      break;
    }

    // Non-SKU: always run through fuzzy stage for %contains% recall.
    if (!intent.skuLike && ranked.size >= need && stage === "fuzzy") {
      break;
    }
  }

  return [...ranked.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([id]) => id)
    .slice(offsetN, offsetN + pageCap);
}

/**
 * @param {import("../utils/productsTableColumns.server.js").getProductsColumnsResolved extends () => Promise<infer T> ? T : never} pc
 */
import { buildListingFitmentSelectSql } from "../repositories/productList.repository.js";

export function buildProductListSelectColumns(pc, vehicleFilters = {}) {
  const freshnessExpr = pc.orderExprQualified("p");
  const fitmentSelect = buildListingFitmentSelectSql(pc, vehicleFilters);
  return {
    freshnessExpr,
    fitmentParams: fitmentSelect.params,
    sql: `
          ${pc.idExpr("p")},
          ${pc.shopIdSqlSelect("p")},
          ${pc.partNumberSqlSelect("p")},
          ${pc.nameSqlSelect("p")},
          ${pc.priceSqlSelect("p")},
          ${pc.shortDescriptionSqlSelect("p")},
          ${pc.originSqlSelect("p")},
          ${pc.stockSqlSelect("p")},
          ${freshnessExpr} AS updatedAt,
          s.name AS shopName,
          s.phone AS phone,
          a.tinh_tp AS provinceName,
          ${fitmentSelect.sql}
    `,
  };
}

/**
 * Hydrate listing rows for pre-ranked product IDs (preserves order).
 */
export async function selectProductListRowsByIdsInOrder({
  pc,
  ids,
  joinVehicleFitment = false,
  joinCategoryMap = false,
  vehicleFilters = {},
  fromSqlBuilder,
}) {
  if (!ids.length) return [];

  const { sql: selectCols, fitmentParams = [] } = buildProductListSelectColumns(
    pc,
    vehicleFilters,
  );
  const fromSql = fromSqlBuilder(pc, { joinVehicleFitment, joinCategoryMap });
  const fieldOrder = ids.map(() => "?").join(", ");

  const sql = `
    SELECT ${selectCols}
    ${fromSql}
    WHERE ${pc.idExpr("p")} IN (?)
    ORDER BY FIELD(${pc.idExpr("p")}, ${fieldOrder})
  `;

  const [rows] = await pool.query(sql, [...fitmentParams, ids, ...ids]);
  return rows;
}
