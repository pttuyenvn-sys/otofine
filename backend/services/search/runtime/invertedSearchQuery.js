/**
 * SEARCH-INVERTED-INDEX-RUNTIME-01 — query interpretation (normalize → tokenize → expand).
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";
import { normalizeMatcherQuery } from "../matcher/searchMatcherNormalize.js";
import { tokenizeTextForIndex, adjacentPhrases } from "../inverted/searchTokenPhrase.js";
import { cleanBusinessToken } from "../inverted/searchTokenGarbageFilter.js";
import { isStopWord } from "../../../config/searchTokenStopWords.js";
import { loadDepthOneSynonyms } from "../inverted/searchTokenSynonymSource.js";
import { pool } from "../../../config/db.js";
import { resolveSearchFacets } from "../providers/searchFacetResolver.js";

/**
 * @typedef {object} InvertedQueryPlan
 * @property {string} keyword
 * @property {string} folded
 * @property {string | null} partNumberNorm
 * @property {string[]} queryTokens
 * @property {string[]} expandedTokens
 * @property {object} facets
 */

function uniqueTokens(list) {
  return [...new Set(list.map((t) => foldVi(t)).filter((t) => t && t.length >= 2))];
}

/**
 * @param {Record<string, unknown>} rawQuery
 * @param {string} keyword
 * @returns {Promise<InvertedQueryPlan>}
 */
export async function buildInvertedQueryPlan(rawQuery, keyword) {
  const norm = normalizeMatcherQuery(keyword);
  const facets = await resolveSearchFacets(rawQuery, keyword);

  const tokens = new Set();

  if (norm.partNumberNorm) {
    tokens.add(norm.partNumberNorm);
    tokens.add(norm.raw.replace(/[\s-]/g, "").toLowerCase());
    tokens.add(norm.raw.toLowerCase());
  }

  const { words, phrases } = tokenizeTextForIndex(norm.folded);
  for (const w of words) tokens.add(w);
  for (const p of phrases) tokens.add(p);

  if (facets.brand) tokens.add(cleanBusinessToken(facets.brand));
  if (facets.model) tokens.add(cleanBusinessToken(facets.model));
  if (facets.category) tokens.add(cleanBusinessToken(facets.category));
  if (facets.year != null) tokens.add(String(facets.year));
  if (facets.location) tokens.add(cleanBusinessToken(facets.location));

  const seedTerms = [...tokens];
  const synonyms = await loadDepthOneSynonyms(pool, {
    categoryName: facets.category,
    seedTerms,
  });

  for (const syn of synonyms) tokens.add(syn);

  const queryTokens = uniqueTokens([...words, ...phrases.filter((p) => !p.includes(" "))]);
  const expandedTokens = uniqueTokens([...tokens].filter((t) => !isStopWord(t)));

  return {
    keyword,
    folded: norm.folded,
    partNumberNorm: norm.partNumberNorm,
    queryTokens: expandedTokens.length ? expandedTokens : queryTokens,
    expandedTokens,
    facets,
  };
}

export { adjacentPhrases, tokenizeTextForIndex };
