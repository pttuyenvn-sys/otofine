/**
 * SEARCH-INVERTED-INDEX-BUILDER-OPTIMIZATION-01 — optimized inverted token builder.
 * Generates from canonical business fields only (no token column replay).
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";
import { normalizePartNumber } from "../../../utils/listingQueryNormalize.js";
import { isStopWord } from "../../../config/searchTokenStopWords.js";
import { resolveTokenWeight } from "./searchTokenIndexWeights.js";
import { classifyGarbageToken, cleanBusinessToken } from "./searchTokenGarbageFilter.js";
import { tokenizeTextForIndex, adjacentPhrases } from "./searchTokenPhrase.js";
import { loadSeoAliasesForCategories, loadDepthOneSynonyms } from "./searchTokenSynonymSource.js";
import { isLegacyInvertedBuilderEnabled } from "../../../config/searchInvertedIndexConfig.js";
import { buildInvertedTokensForProductLegacy } from "./SearchTokenIndexBuilder.legacy.js";

/** @typedef {import('./searchTokenIndexWeights.js').TokenType} TokenType */

const TYPE_PRIORITY = {
  OEM: 100,
  CATEGORY: 80,
  BRAND: 70,
  MODEL: 70,
  YEAR: 60,
  LOCATION: 50,
  SYNONYM: 40,
  PHRASE: 30,
  WORD: 20,
};

/**
 * @typedef {object} InvertedTokenRow
 * @property {string} token
 * @property {string} token_type
 * @property {number} product_id
 * @property {number} weight
 * @property {string} source
 * @property {number} position
 * @property {number} document_version
 */

/**
 * @typedef {object} BuilderDiagnostics
 * @property {Array<{ token: string, reason: string }>} garbage
 */

/**
 * @param {object[]} indexRows
 */
function aggregateProductContext(indexRows) {
  const primary = indexRows[0] || {};
  const years = new Set();

  for (const row of indexRows) {
    for (const y of [row.year_from, row.year_to, row.primary_year_from, row.primary_year_to]) {
      const n = Number(y);
      if (Number.isFinite(n) && n >= 1950 && n <= 2035) years.add(n);
    }
  }

  const brand = cleanBusinessToken(
    primary.primary_brand_name || primary.brand_name,
  );
  const model = cleanBusinessToken(
    primary.primary_model_name || primary.model_name,
  );
  const category = cleanBusinessToken(
    primary.category_name || primary.canonical_name,
  );

  return {
    title: String(primary.title || primary.product_name || "").trim(),
    partNumber: String(primary.part_number || "").trim(),
    partNumberNorm: String(primary.part_number_norm || "").trim(),
    category,
    brand,
    model,
    location: cleanBusinessToken(primary.location_name),
    searchKeywords: String(primary.search_keywords || "").trim(),
    years: [...years].sort((a, b) => a - b),
  };
}

/**
 * @param {Map<string, { token: string, token_type: string, weight: number, source: string, position: number }>} byKey
 * @param {Map<string, string>} crossType
 * @param {string} tokenType
 * @param {string} raw
 * @param {string} source
 * @param {number} [position]
 * @param {BuilderDiagnostics} [diag]
 */
function stageToken(byKey, crossType, tokenType, raw, source, position = 0, diag = null) {
  const allowYear = tokenType === "YEAR";
  const allowNumeric = tokenType === "OEM";
  const garbage = classifyGarbageToken(raw, { allowYear, allowNumeric });
  if (garbage) {
    diag?.garbage.push(garbage);
    return;
  }

  let token = cleanBusinessToken(raw, { allowYear, allowNumeric });
  if (!token) return;

  if (tokenType === "WORD" || tokenType === "PHRASE") {
    if (isStopWord(token)) return;
    if (tokenType === "WORD" && token.includes(" ")) return;
  }

  if (tokenType === "WORD" && crossType.has(token)) return;

  const key = `${tokenType}\x1f${token}`;
  const weight = resolveTokenWeight(tokenType, source);
  const prev = byKey.get(key);
  if (!prev || weight > prev.weight) {
    byKey.set(key, { token, token_type: tokenType, weight, source, position });
  }

  const existingType = crossType.get(token);
  if (!existingType || (TYPE_PRIORITY[tokenType] || 0) > (TYPE_PRIORITY[existingType] || 0)) {
    crossType.set(token, tokenType);
  }
}

function emitOemTokens(byKey, crossType, partNumber, diag) {
  const raw = String(partNumber || "").trim();
  if (!raw) return;
  const normalized = normalizePartNumber(raw);
  const hyphenFree = foldVi(raw.replace(/[-\s]/g, ""));

  const variants = [...new Set([raw, normalized, hyphenFree].filter(Boolean))];
  variants.forEach((v, i) => stageToken(byKey, crossType, "OEM", v, "part_number", i, diag));
}

/**
 * @param {Map<string, object>} byKey
 * @param {Map<string, string>} crossType
 */
function applyCrossTypeDedup(byKey, crossType) {
  for (const [token, winType] of crossType.entries()) {
    for (const [key, entry] of [...byKey.entries()]) {
      if (entry.token === token && entry.token_type !== winType) {
        byKey.delete(key);
      }
    }
  }
}

/**
 * @param {number} productId
 * @param {object[]} indexRows
 * @param {{ documentVersion?: number, seoAliases?: string[], dictionarySynonyms?: string[], diagnostics?: BuilderDiagnostics }} [opts]
 * @returns {InvertedTokenRow[]}
 */
export function buildInvertedTokensForProductOptimized(productId, indexRows, opts = {}) {
  const pid = Number(productId);
  const documentVersion = Number(opts.documentVersion) || 1;
  const diag = opts.diagnostics || null;
  const ctx = aggregateProductContext(indexRows);

  /** @type {Map<string, { token: string, token_type: string, weight: number, source: string, position: number }>} */
  const byKey = new Map();
  /** @type {Map<string, string>} */
  const crossType = new Map();

  if (ctx.title) {
    const { words, phrases } = tokenizeTextForIndex(ctx.title);
    words.forEach((w, i) => stageToken(byKey, crossType, "WORD", w, "title", i, diag));
    phrases.forEach((p, i) => stageToken(byKey, crossType, "PHRASE", p, "title", i, diag));

    const yearRange = ctx.title.match(/(\d{4})\s*-\s*(\d{4})/);
    if (yearRange) {
      stageToken(byKey, crossType, "PHRASE", `${yearRange[1]}-${yearRange[2]}`, "title", 0, diag);
    }
  }

  const productName = String(indexRows[0]?.product_name || "").trim();
  if (productName && foldVi(productName) !== foldVi(ctx.title)) {
    const { words, phrases } = tokenizeTextForIndex(productName);
    words.forEach((w, i) => stageToken(byKey, crossType, "WORD", w, "product_name", i, diag));
    phrases.forEach((p, i) => stageToken(byKey, crossType, "PHRASE", p, "product_name", i, diag));
  }

  emitOemTokens(byKey, crossType, ctx.partNumber || ctx.partNumberNorm, diag);

  if (ctx.category) {
    stageToken(byKey, crossType, "CATEGORY", ctx.category, "category", 0, diag);
    const categorySlug = cleanBusinessToken(indexRows[0]?.category_slug);
    if (categorySlug && categorySlug !== ctx.category) {
      stageToken(byKey, crossType, "SYNONYM", categorySlug, "category_slug", 0, diag);
    }
  }
  if (ctx.brand) {
    stageToken(byKey, crossType, "BRAND", ctx.brand, "brand", 0, diag);
  }
  if (ctx.model) {
    stageToken(byKey, crossType, "MODEL", ctx.model, "model", 0, diag);
  }
  if (ctx.location) {
    stageToken(byKey, crossType, "LOCATION", ctx.location, "location", 0, diag);
    const locWords = tokenizeTextForIndex(ctx.location).words;
    adjacentPhrases(locWords).forEach((p, i) => {
      stageToken(byKey, crossType, "PHRASE", p, "location", i, diag);
    });
  }

  ctx.years.forEach((y) => stageToken(byKey, crossType, "YEAR", String(y), "year", y, diag));

  if (ctx.searchKeywords) {
    const segments = ctx.searchKeywords.split("|").map((s) => s.trim()).filter(Boolean);
    let pos = 0;
    const titleBlob = foldVi(ctx.title);
    for (const segment of segments) {
      const { words, phrases } = tokenizeTextForIndex(segment);
      words.forEach((w) => {
        stageToken(byKey, crossType, "WORD", w, "search_keywords", pos, diag);
        if (w.length >= 3 && !titleBlob.includes(w)) {
          stageToken(byKey, crossType, "SYNONYM", w, "search_keywords_alias", pos, diag);
        }
        pos += 1;
      });
      phrases.forEach((p, i) => {
        stageToken(byKey, crossType, "PHRASE", p, "search_keywords", i, diag);
      });
      const segPhrase = cleanBusinessToken(segment);
      if (segPhrase && segPhrase.includes(" ") && !foldVi(ctx.title).includes(segPhrase)) {
        stageToken(byKey, crossType, "SYNONYM", segPhrase, "search_keywords", 0, diag);
      }
    }
  }

  for (const row of indexRows.slice(1, 4)) {
    const extraModel = cleanBusinessToken(row.model_name);
    if (extraModel && extraModel !== ctx.model) {
      stageToken(byKey, crossType, "MODEL", extraModel, "model_fitment", 0, diag);
    }
    const extraBrand = cleanBusinessToken(row.brand_name);
    if (extraBrand && extraBrand !== ctx.brand) {
      stageToken(byKey, crossType, "BRAND", extraBrand, "brand_fitment", 0, diag);
    }
  }

  const titleBlob = foldVi(ctx.title);
  for (const row of indexRows) {
    if (!row.vehicle_label) continue;
    const { words } = tokenizeTextForIndex(String(row.vehicle_label));
    let added = 0;
    for (const w of words) {
      if (added >= 6) break;
      if (!titleBlob.includes(w)) {
        stageToken(byKey, crossType, "WORD", w, "vehicle", added, diag);
        added += 1;
      }
    }
  }

  const seoAliases = opts.seoAliases || [];
  for (const alias of seoAliases) {
    stageToken(byKey, crossType, "SYNONYM", alias, "seo_alias", 0, diag);
  }

  const dictSynonyms = opts.dictionarySynonyms || [];
  for (const syn of dictSynonyms) {
    stageToken(byKey, crossType, "SYNONYM", syn, "synonym_dictionary", 0, diag);
  }

  applyCrossTypeDedup(byKey, crossType);

  return [...byKey.values()].map((entry) => ({
    token: entry.token,
    token_type: entry.token_type,
    product_id: pid,
    weight: entry.weight,
    source: entry.source,
    position: entry.position,
    document_version: documentVersion,
  }));
}

/**
 * @param {number} productId
 * @param {object[]} indexRows
 * @param {object} [opts]
 */
export function buildInvertedTokensForProduct(productId, indexRows, opts = {}) {
  if (isLegacyInvertedBuilderEnabled()) {
    return buildInvertedTokensForProductLegacy(productId, indexRows, opts);
  }
  return buildInvertedTokensForProductOptimized(productId, indexRows, opts);
}

export { loadSeoAliasesForCategories, loadDepthOneSynonyms };

export const SearchTokenIndexBuilder = {
  buildInvertedTokensForProduct,
  buildInvertedTokensForProductOptimized,
  loadSeoAliasesForCategories,
  loadDepthOneSynonyms,
};
