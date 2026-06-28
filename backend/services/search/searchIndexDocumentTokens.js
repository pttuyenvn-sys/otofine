/**
 * SEARCH-INDEX-MATCHER-01 — precomputed token fields for product_search_index.
 */

import { foldVi } from "../../utils/keywordRelevanceRanking.js";
import { tokenizeDocumentField } from "./matcher/searchMatcherTokenize.js";
import { expandTokensWithSynonyms } from "./matcher/searchMatcherSynonymSource.js";

function padTokens(tokens) {
  const unique = [...new Set(tokens.filter((t) => t && t.length >= 2))];
  return unique.length ? ` ${unique.join(" ")} ` : null;
}

/**
 * @param {import('./searchIndexDocument.builder.js').SearchIndexDocument} doc
 * @param {Map<string, Set<string>>} [synonymGraph]
 */
export function buildIndexTokenFields(doc, synonymGraph = new Map()) {
  const sourceText = [
    doc.search_text,
    doc.product_name,
    doc.search_keywords,
    doc.part_number,
    doc.category_name,
    doc.brand_name,
    doc.model_name,
    doc.vehicle_label,
    doc.primary_brand_name,
    doc.primary_model_name,
  ]
    .filter(Boolean)
    .join(" ");

  const folded = foldVi(sourceText);
  const searchTokens = tokenizeDocumentField(folded);
  const normalized = [...new Set(searchTokens.map((t) => foldVi(t)))];
  const synonymExpanded = expandTokensWithSynonyms(normalized, synonymGraph);

  return {
    search_tokens: padTokens(searchTokens),
    normalized_tokens: padTokens(normalized),
    synonym_tokens: padTokens(synonymExpanded),
  };
}
