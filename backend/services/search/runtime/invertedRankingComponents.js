/**
 * SEARCH-RANKING-PARITY-01 — component scores for weighted_v2 inverted ranking.
 */

import { foldVi, normalizeSearchText, scoreKeywordRelevance } from "../../../utils/keywordRelevanceRanking.js";

/**
 * Best (minimum) keyword relevance tier across full query and query tokens.
 * @param {object} row
 * @param {object} ctx
 */
export function computeLegacyTier(row, ctx) {
  const title = String(row.title || row.product_name || "");
  const partNumber = row.part_number;
  const queries = new Set();
  const full = String(ctx.queryKeyword || ctx.foldedPhrase || "").trim();
  if (full) queries.add(full);

  const facetBrand = foldVi(ctx.facets?.brand || "");
  const facetModel = foldVi(ctx.facets?.model || "");

  for (const token of ctx.queryTokens || []) {
    const t = String(token || "").trim();
    if (t.length < 2) continue;
    const folded = foldVi(t);
    if (facetBrand && folded === facetBrand) continue;
    if (facetModel && folded === facetModel) continue;
    queries.add(t);
  }

  let best = 9;
  for (const query of queries) {
    const tier = scoreKeywordRelevance({ title, partNumber, query });
    if (tier < best) best = tier;
  }
  return best;
}

/**
 * @param {object} row
 * @param {object} ctx
 * @param {Record<string, number>} weights
 */
export function computeInvertedRankingComponents(row, ctx, weights) {
  const title = String(row.title || row.product_name || "");
  const titleFold = foldVi(title);
  const titleNorm = normalizeSearchText(title);
  const searchText = foldVi(row.search_text || "");
  const blob = ` ${titleFold} ${searchText} `;

  const queryKeyword = String(ctx.queryKeyword || ctx.foldedPhrase || "").trim();
  const queryFold = foldVi(queryKeyword);
  const queryNorm = normalizeSearchText(queryKeyword);
  const queryWords = queryFold.split(/\s+/).filter((w) => w.length >= 2);

  const categoryFold = foldVi(row.category_name || "");
  const categoryNorm = normalizeSearchText(row.category_name || "");

  /** @type {Record<string, number>} */
  const components = {
    oem: 0,
    phrase: 0,
    category: 0,
    brand: 0,
    model: 0,
    keyword_coverage: 0,
    popularity: 0,
    search_priority: 0,
    business_boost: 0,
    retrieval: 0,
    matched_tokens: 0,
    legacy_tier: 0,
    part_number_has: 0,
    price_has: 0,
    mod_day: 0,
    freshness: 0,
  };

  if (ctx.partNumberNorm) {
    const pn = String(row.part_number_norm || "").toLowerCase();
    const rawPn = String(row.part_number || "").toLowerCase();
    if (pn === ctx.partNumberNorm) components.oem = weights.oem_exact || 0;
    else if (rawPn.includes(ctx.partNumberNorm) || pn.includes(ctx.partNumberNorm)) {
      components.oem = weights.oem_partial || 0;
    }
  }

  const foldedPhrase = ctx.foldedPhrase ? foldVi(ctx.foldedPhrase) : "";
  if (foldedPhrase && blob.includes(` ${foldedPhrase} `)) {
    components.phrase = weights.phrase_exact || 0;
  } else if (queryFold && titleFold.startsWith(queryFold)) {
    components.phrase = weights.title_starts_with || 0;
  } else if (queryFold.includes(" ") && titleFold.includes(queryFold)) {
    components.phrase = weights.title_phrase || 0;
  } else if (queryFold && titleFold.includes(queryFold)) {
    components.phrase = weights.title_contains || 0;
  }

  if (categoryFold && queryFold) {
    if (categoryFold === queryFold || categoryNorm === queryNorm) {
      components.category = weights.category_exact || 0;
    } else if (queryFold.includes(" ") && categoryFold.startsWith(queryFold)) {
      components.category = weights.category_phrase || 0;
    } else if (queryWords[0] && categoryFold.split(/\s+/)[0] === queryWords[0]) {
      components.category = weights.category_primary_word || 0;
    } else if (queryWords.every((w) => categoryFold.includes(w))) {
      components.category = Math.round((weights.category_primary_word || 0) * 0.5);
    }
  }

  if (ctx.facets?.brand && foldVi(row.brand_name) === foldVi(ctx.facets.brand)) {
    components.brand = weights.brand || 0;
  }
  if (ctx.facets?.model && foldVi(row.model_name) === foldVi(ctx.facets.model)) {
    components.model = weights.model || 0;
  }

  const tokens = (ctx.queryTokens || []).filter((t) => String(t).length >= 2);
  if (tokens.length) {
    let tokenHits = 0;
    for (const token of tokens) {
      const t = foldVi(token);
      if (blob.includes(` ${t} `)) tokenHits += 1;
    }
    components.keyword_coverage = (tokenHits / tokens.length) * (weights.keyword_coverage_max || 0);
  }

  components.popularity = Math.min(
    weights.popularity_max || 0,
    (Number(row.popularity_score) || 0) / 1e12 * (weights.popularity_max || 0),
  );
  components.search_priority = Math.min(
    weights.search_priority_max || 0,
    Number(row.search_priority) || 0,
  );
  components.business_boost = Math.min(
    weights.business_boost_max || 0,
    Number(row.business_boost || row.search_priority) || 0,
  );

  components.retrieval = Number(ctx.retrievalScore || 0) * (weights.retrieval_factor || 0);
  components.matched_tokens = Number(ctx.matchedTokens || 0) * (weights.matched_tokens_factor || 0);

  const legacyTier = computeLegacyTier(row, ctx);
  const tierBase = weights.legacy_tier_base || 0;
  components.legacy_tier = tierBase > 0 ? Math.max(0, (10 - legacyTier) * tierBase) : 0;

  if (row.part_number && String(row.part_number).trim()) {
    components.part_number_has = weights.part_number_has || 0;
  }
  if (Number(row.price) > 0) {
    components.price_has = weights.price_has || 0;
  }

  const pid = Number(row.product_id) || 0;
  const dayOfMonth = new Date().getDate();
  const modVal = (dayOfMonth + pid) % 7;
  components.mod_day = (7 - modVal) * (weights.mod_day_factor || 0);

  const freshnessMs = Number(row.popularity_score) || 0;
  components.freshness = (freshnessMs / 1e15) * (weights.freshness_factor || 0);

  const finalScore =
    components.oem
    + components.phrase
    + components.category
    + components.brand
    + components.model
    + components.keyword_coverage
    + components.popularity
    + components.search_priority
    + components.business_boost
    + components.retrieval
    + components.matched_tokens
    + components.legacy_tier
    + components.part_number_has
    + components.price_has
    + components.mod_day
    + components.freshness;

  return {
    components,
    finalScore: Math.round(finalScore * 1000) / 1000,
    legacyTier,
    tierBoost: components.legacy_tier,
  };
}
