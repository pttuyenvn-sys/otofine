/**
 * Provider cascade: exact → structured+fulltext → like fallback.
 * HYBRID-SEARCH-QUALITY-GATE-01 — quality-based FULLTEXT decision layer.
 */

import { pool } from "../../../config/db.js";
import {
  getSearchEngineMode,
  isSearchEngineDebug,
} from "../../../config/searchEngineConfig.js";
import { buildPublicProductWhereClause } from "../../../modules/products/services/productPublicVisibility.server.js";
import {
  buildProductListingJoinSql,
} from "../../../repositories/productList.repository.js";
import { resolveSearchFacets } from "./searchFacetResolver.js";
import { buildExactSearchClause } from "./exactSearchProvider.js";
import { buildStructuredSearchClause } from "./structuredSearchProvider.js";
import {
  buildFulltextSearchClause,
  detectFulltextIndexes,
} from "./fullTextSearchProvider.js";
import { buildLikeFallbackClause } from "./likeFallbackProvider.js";
import {
  assessParserRisk,
  computeQualityScore,
  decideFulltextUsage,
  logQualityGateDecision,
} from "./searchQualityGate.js";

function useStrictParityGate() {
  return String(process.env.SEARCH_DECISION_MODE || "quality_gate").trim() === "strict_parity";
}

const decisionCache = new Map();
const DECISION_CACHE_MAX = 400;

function decisionCacheKey(rawQuery, keyword) {
  return JSON.stringify({
    keyword,
    brand: rawQuery.brand ?? "",
    model: rawQuery.model ?? "",
    year: rawQuery.year ?? "",
    category: rawQuery.category ?? "",
    location: rawQuery.location ?? rawQuery.city ?? "",
  });
}

/**
 * @param {Awaited<ReturnType<typeof import('../../../utils/productsTableColumns.server.js').getProductsColumnsResolved>>} pc
 * @param {string} fromSql
 * @param {string} where
 * @param {unknown[]} params
 * @param {number} [limit]
 */
async function fetchDistinctProductIds(pc, fromSql, where, params, limit = 300) {
  const pid = pc.idExpr("p");
  const [rows] = await pool.query(
    `
    SELECT DISTINCT ${pid} AS id
    ${fromSql}
    ${where}
    ORDER BY id
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows.map((r) => r.id);
}

/**
 * @param {Awaited<ReturnType<typeof import('../../../utils/productsTableColumns.server.js').getProductsColumnsResolved>>} pc
 * @param {string} fromSql
 * @param {string} where
 * @param {unknown[]} params
 * @param {number} [limit]
 */
export async function fetchFulltextQualitySample(pc, fromSql, where, params, limit = 80) {
  const pid = pc.idExpr("p");
  const title = pc.partNameExpr("p");
  const pn = pc.partNumberExpr("p");
  const [rows] = await pool.query(
    `
    SELECT DISTINCT
      ${pid} AS id,
      ${title} AS title,
      ${pn} AS partNumber,
      COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS category_name,
      cm.hang_xe AS brand,
      cm.ten_xe AS model,
      pa.year_from,
      pa.year_to
    ${fromSql}
    ${where}
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows;
}

async function fulltextMatchesLegacy(
  pc,
  fromSql,
  ftWhere,
  ftParams,
  legacyWhere,
  legacyParams,
) {
  const [ftIds, legacyIds] = await Promise.all([
    fetchDistinctProductIds(pc, fromSql, ftWhere, ftParams),
    fetchDistinctProductIds(pc, fromSql, legacyWhere, legacyParams),
  ]);
  if (ftIds.length !== legacyIds.length) return false;
  return ftIds.every((id, idx) => id === legacyIds[idx]);
}

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
 * @typedef {object} SearchExecutionResult
 * @property {string} where
 * @property {unknown[]} params
 * @property {string} keywordOrder
 * @property {string} provider
 * @property {boolean} needsProductMetaJoin
 * @property {number} [qualityScore]
 * @property {boolean} [parityUsed]
 */

/**
 * @param {Awaited<ReturnType<typeof import('../../../utils/productsTableColumns.server.js').getProductsColumnsResolved>>} pc
 * @param {Record<string, unknown>} rawQuery
 * @returns {Promise<SearchExecutionResult>}
 */
export async function resolveSearchExecution(pc, rawQuery) {
  const keyword = String(rawQuery.keyword || rawQuery.query || rawQuery.q || "").trim();
  const mode = getSearchEngineMode();

  if (mode === "legacy") {
    const legacy = buildLikeFallbackClause(pc, { ...rawQuery, keyword });
    const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
    return {
      where: legacy.where + vis.sql,
      params: [...legacy.params],
      keywordOrder: legacy.keywordOrder,
      provider: "legacy",
      needsProductMetaJoin: false,
    };
  }

  const facets = await resolveSearchFacets(rawQuery, keyword);
  const risk = assessParserRisk(facets, keyword);
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const baseWhere = ` WHERE 1=1 ${vis.sql} `;
  const structured = buildStructuredSearchClause(pc, facets, rawQuery);

  const fromSql = buildProductListingJoinSql(pc, {
    joinCategoryMap: true,
    joinVehicleFitment: true,
  });

  const fulltextReady = await detectFulltextIndexes(pool);

  const tryProvider = (clause, needsMeta) => {
    const joinSql = needsMeta ? injectProductMetaJoin(fromSql, pc) : fromSql;
    const where = baseWhere + structured.where + clause.where;
    const params = [...structured.params, ...clause.params];
    return { joinSql, where, params, keywordOrder: clause.keywordOrder || "" };
  };

  const like = buildLikeFallbackClause(pc, { ...rawQuery, keyword });
  const legacyWhere = like.where + vis.sql;
  const legacyParams = [...like.params];

  // Step 1 — exact (hybrid; quality-gated)
  if (mode === "hybrid") {
    const exact = buildExactSearchClause(pc, facets);
    if (exact.active) {
      const candidate = tryProvider(exact, exact.needsProductMetaJoin);
      const sample = await fetchFulltextQualitySample(
        pc,
        candidate.joinSql,
        candidate.where,
        candidate.params,
        20,
      );
      const quality = computeQualityScore(facets, keyword, sample);
      const decision = decideFulltextUsage({
        qualityScore: quality.score,
        risk: { level: "low", confidence: "high", reason: "part-number" },
        parityOk: null,
      });
      if (decision.useFulltext && sample.length > 0) {
        logQualityGateDecision({
          query: keyword,
          qualityScore: quality.score,
          provider: "exact",
          parityUsed: false,
          risk,
          decisionReason: decision.reason,
          breakdown: quality.breakdown,
        });
        return {
          where: candidate.where,
          params: candidate.params,
          keywordOrder: candidate.keywordOrder,
          provider: "exact",
          needsProductMetaJoin: exact.needsProductMetaJoin,
          qualityScore: quality.score,
          parityUsed: false,
        };
      }
    }
  }

  const textForFulltext = facets.textQuery;

  if (fulltextReady && textForFulltext && (mode === "hybrid" || mode === "fulltext")) {
    const ft = buildFulltextSearchClause(pc, textForFulltext);
    if (ft.active) {
      const candidate = tryProvider(ft, true);
      const cacheKey = decisionCacheKey(rawQuery, keyword);
      let cached = decisionCache.get(cacheKey);

      if (!cached) {
        const sample = await fetchFulltextQualitySample(
          pc,
          candidate.joinSql,
          candidate.where,
          candidate.params,
        );

        if (useStrictParityGate()) {
          const parityOk = await fulltextMatchesLegacy(
            pc,
            candidate.joinSql,
            candidate.where,
            candidate.params,
            legacyWhere,
            legacyParams,
          );
          cached = {
            useFulltext: parityOk,
            quality: { score: parityOk ? 100 : 0, breakdown: {} },
            decision: { reason: parityOk ? "strict-parity-pass" : "strict-parity-fail" },
            parityUsed: true,
          };
        } else {
          const quality = computeQualityScore(facets, keyword, sample);

          let parityOk = null;
          let parityUsed = false;

          if (risk.level === "high") {
            parityUsed = true;
            parityOk = await fulltextMatchesLegacy(
              pc,
              candidate.joinSql,
              candidate.where,
              candidate.params,
              legacyWhere,
              legacyParams,
            );
          }

          const decision = decideFulltextUsage({
            qualityScore: quality.score,
            risk,
            parityOk,
          });

          cached = { useFulltext: decision.useFulltext, quality, decision, parityUsed };
        }

        if (decisionCache.size >= DECISION_CACHE_MAX) {
          decisionCache.clear();
        }
        decisionCache.set(cacheKey, cached);

        logQualityGateDecision({
          query: keyword,
          qualityScore: cached.quality?.score ?? 0,
          provider: cached.useFulltext
            ? (facets.hasStructuredFacets ? "structured+fulltext" : "fulltext")
            : "like-fallback",
          parityUsed: cached.parityUsed,
          risk,
          decisionReason: cached.decision?.reason,
          breakdown: cached.quality?.breakdown,
        });
      }

      if (cached.useFulltext) {
        return {
          where: candidate.where,
          params: candidate.params,
          keywordOrder: candidate.keywordOrder,
          provider: facets.hasStructuredFacets ? "structured+fulltext" : "fulltext",
          needsProductMetaJoin: true,
          qualityScore: cached.quality?.score,
          parityUsed: cached.parityUsed,
        };
      }

      if (isSearchEngineDebug()) {
        console.log(
          "[search-engine] quality gate → like-fallback",
          { keyword, reason: cached.decision?.reason },
        );
      }
    }
  }

  if (isSearchEngineDebug()) {
    console.log("[search-engine] provider=like-fallback", { keyword, mode });
  }
  return {
    where: legacyWhere,
    params: legacyParams,
    keywordOrder: like.keywordOrder,
    provider: "like-fallback",
    needsProductMetaJoin: false,
  };
}

/** Clear cached decisions (tests / benchmarks). */
export function resetSearchDecisionCache() {
  decisionCache.clear();
}
