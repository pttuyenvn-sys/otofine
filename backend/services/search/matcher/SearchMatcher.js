/**
 * SEARCH-INDEX-MATCHER-01 — SearchMatcher (index-only candidate retrieval + scoring).
 */

import { pool } from "../../../config/db.js";
import { foldVi } from "../../../utils/keywordRelevanceRanking.js";
import { resolveSearchFacets } from "../providers/searchFacetResolver.js";
import {
  buildIndexExactClause,
  buildIndexPartNumberNormClause,
  buildIndexStructuredClause,
} from "../runtime/indexSearchClauses.js";
import { normalizeMatcherQuery } from "./searchMatcherNormalize.js";
import { tokenizeMatcherQuery } from "./searchMatcherTokenize.js";
import {
  expandTokensWithSynonyms,
  loadSynonymGraph,
} from "./searchMatcherSynonymSource.js";
import { rankMatcherDocuments } from "./searchMatcherScore.js";

const BASE_WHERE = ` AND psi.status = 'active' `;
const CANDIDATE_LIMIT = 800;

function whereBody(whereClause) {
  return String(whereClause || "").replace(/^\s*AND\s*/i, "").trim();
}

/**
 * Build token match on precomputed index columns (not products, not broad LIKE on search_text).
 * @param {string[]} requiredTokens — query tokens (not all expansions)
 */
function buildTokenMatchClause(requiredTokens) {
  const tokens = [...new Set(requiredTokens.map((t) => foldVi(t)).filter((t) => t.length >= 2))];
  if (!tokens.length) return { where: "", params: [] };

  const clauses = [];
  const params = [];
  for (const token of tokens) {
    clauses.push(`(
      CONCAT(' ', COALESCE(psi.normalized_tokens, ''), ' ') LIKE ?
      OR CONCAT(' ', COALESCE(psi.synonym_tokens, ''), ' ') LIKE ?
    )`);
    params.push(`% ${token} %`, `% ${token} %`);
  }
  return {
    where: ` AND (${clauses.join(" AND ")}) `,
    params,
  };
}

function buildMatcherOrderSql(scoredProductIds) {
  if (!scoredProductIds.length) return "";
  const cases = scoredProductIds
    .slice(0, 200)
    .map((id, i) => `WHEN ${Number(id)} THEN ${i}`)
    .join(" ");
  return `CASE psi.product_id ${cases} ELSE 999999 END,`;
}

/**
 * @param {Record<string, unknown>} rawQuery
 * @param {string} keyword
 */
export async function resolveMatcherExecution(rawQuery, keyword) {
  const norm = normalizeMatcherQuery(keyword);
  if (!norm.folded && !norm.partNumberNorm) return null;

  const facets = await resolveSearchFacets(rawQuery, keyword);
  const structured = buildIndexStructuredClause(facets, rawQuery);
  const exact = buildIndexExactClause(facets);

  if (exact.active) {
    const where = BASE_WHERE + structured.where + exact.where;
    const params = [...structured.params, ...exact.params];
    const count = await countMatches(where, params);
    if (count > 0) {
      return {
        where,
        params,
        keywordOrder: exact.keywordOrder,
        provider: "matcher-exact-index",
        matcherMeta: { stage: "exact", candidates: count },
      };
    }
  }

  if (norm.partNumberNorm) {
    const pnClause = buildIndexPartNumberNormClause(norm.partNumberNorm, norm.raw);
    if (pnClause.active) {
      const where = BASE_WHERE + structured.where + pnClause.where;
      const params = [...structured.params, ...pnClause.params];
      const count = await countMatches(where, params);
      if (count > 0) {
        return {
          where,
          params,
          keywordOrder: pnClause.keywordOrder,
          provider: "matcher-part-index",
          matcherMeta: { stage: "part-number", candidates: count },
        };
      }
    }
  }

  const { single, phrases, all } = tokenizeMatcherQuery(norm.folded);
  const graph = await loadSynonymGraph();
  const expanded = expandTokensWithSynonyms(all, graph);

  const queryTokens = single.length ? single : all.slice(0, 1);
  const tokenMatch = buildTokenMatchClause(queryTokens);
  if (!tokenMatch.where && !norm.partNumberNorm) return null;

  const where = BASE_WHERE + structured.where + tokenMatch.where;
  const params = [...structured.params, ...tokenMatch.params];

  const [candidates] = await pool.query(
    `
    SELECT
      psi.product_id,
      psi.normalized_tokens,
      psi.synonym_tokens,
      psi.search_text,
      psi.part_number,
      psi.part_number_norm,
      psi.brand_name,
      psi.model_name,
      psi.year_from,
      psi.year_to,
      psi.category_name,
      psi.search_priority,
      psi.popularity_score
    FROM product_search_index psi
    WHERE ${whereBody(where)}
    LIMIT ?
    `,
    [...params, CANDIDATE_LIMIT],
  );

  if (!candidates.length) return null;

  const ranked = rankMatcherDocuments(candidates, {
    foldedPhrase: phrases[0] || norm.folded,
    queryTokens,
    expandedTokens: expanded,
    facets,
  });

  const productOrder = [];
  const seen = new Set();
  for (const { doc } of ranked) {
    const id = Number(doc.product_id);
    if (!seen.has(id)) {
      seen.add(id);
      productOrder.push(id);
    }
  }

  if (!productOrder.length) return null;

  const idClause = ` AND psi.product_id IN (${productOrder.map(() => "?").join(",")}) `;
  const keywordOrder = buildMatcherOrderSql(productOrder);

  return {
    where: where + idClause,
    params: [...params, ...productOrder],
    keywordOrder,
    provider: "matcher-index",
    matcherMeta: {
      stage: "token",
      documentsScanned: candidates.length,
      uniqueProducts: productOrder.length,
      queryTokens,
      expandedCount: expanded.length,
    },
  };
}

async function countMatches(whereClause, params) {
  const body = whereBody(whereClause);
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT psi.product_id) AS c FROM product_search_index psi WHERE ${body}`,
    params,
  );
  return Number(row.c) || 0;
}

export const SearchMatcher = {
  resolveMatcherExecution,
  normalize: normalizeMatcherQuery,
  tokenize: tokenizeMatcherQuery,
};
