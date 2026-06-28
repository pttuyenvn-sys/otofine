/**
 * SEARCH-INVERTED-INDEX-01 — legacy builder (rollback via SEARCH_INVERTED_INDEX_LEGACY_BUILDER=1).
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";
import { normalizePartNumber } from "../../../utils/listingQueryNormalize.js";
import { tokenizeMatcherQuery } from "../matcher/searchMatcherTokenize.js";
import { resolveTokenWeight } from "./searchTokenIndexWeights.js";

function cleanToken(value) {
  const t = foldVi(String(value || "").trim());
  return t.length >= 2 ? t : null;
}

function unpaddedTokens(padded) {
  return String(padded || "")
    .trim()
    .split(/\s+/)
    .map((t) => cleanToken(t))
    .filter(Boolean);
}

function addToken(acc, tokenType, rawToken, source, position = 0) {
  const token = cleanToken(rawToken);
  if (!token) return;
  const key = `${tokenType}\x1f${token}`;
  const weight = resolveTokenWeight(tokenType, source);
  const prev = acc.get(key);
  if (!prev || weight > prev.weight) {
    acc.set(key, { token, token_type: tokenType, weight, source, position });
  }
}

function addTextTokens(acc, text, source, opts = { words: true, phrases: true }) {
  const folded = foldVi(text);
  if (!folded) return;
  const { single, phrases } = tokenizeMatcherQuery(folded);
  if (opts.words !== false) single.forEach((w, i) => addToken(acc, "WORD", w, source, i));
  if (opts.phrases !== false) phrases.forEach((p, i) => addToken(acc, "PHRASE", p, source, i));
}

function extractFromIndexRow(row, acc, seoAliases = []) {
  const title = row.title || row.product_name;
  if (title) addTextTokens(acc, title, "title");
  if (row.part_number) {
    addToken(acc, "OEM", row.part_number, "part_number", 0);
    addToken(acc, "OEM", normalizePartNumber(row.part_number), "part_number", 1);
  }
  if (row.part_number_norm) addToken(acc, "OEM", row.part_number_norm, "part_number", 2);
  for (const field of ["category_name", "category_slug"]) {
    const v = row[field];
    if (v) addToken(acc, "CATEGORY", v, "category", 0);
  }
  for (const field of ["brand_name", "brand_slug", "primary_brand_name"]) {
    const v = row[field];
    if (v) addToken(acc, "BRAND", v, "brand", 0);
  }
  for (const field of ["model_name", "model_slug", "primary_model_name"]) {
    const v = row[field];
    if (v) addToken(acc, "MODEL", v, "model", 0);
  }
  if (row.location_name) {
    addToken(acc, "LOCATION", row.location_name, "location", 0);
    addTextTokens(acc, row.location_name, "location", { phrases: false });
  }
  for (const y of [row.year_from, row.year_to, row.primary_year_from, row.primary_year_to]) {
    const n = Number(y);
    if (Number.isFinite(n) && n > 0) addToken(acc, "YEAR", String(n), "year", n);
  }
  if (row.vehicle_label) addTextTokens(acc, row.vehicle_label, "vehicle");
  if (row.search_keywords) addTextTokens(acc, row.search_keywords, "search_keywords", { phrases: false });
  unpaddedTokens(row.search_tokens).forEach((t, i) => addToken(acc, "WORD", t, "search_tokens", i));
  unpaddedTokens(row.normalized_tokens).forEach((t, i) => addToken(acc, "WORD", t, "normalized_tokens", i));
  unpaddedTokens(row.synonym_tokens).forEach((t, i) => addToken(acc, "SYNONYM", t, "synonym_tokens", i));
  for (const alias of seoAliases) {
    addToken(acc, "SYNONYM", alias, "seo_alias", 0);
    addTextTokens(acc, alias, "seo_alias", { phrases: false });
  }
}

export async function loadSeoAliasesForCategories(db, categoryNames) {
  const names = [...new Set(categoryNames.map((n) => String(n || "").trim()).filter(Boolean))];
  if (!names.length) return [];
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT match_keyword FROM category_dictionary WHERE is_active = 1 AND canonical_name IN (?)`,
      [names],
    );
    return rows.map((r) => String(r.match_keyword || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function buildInvertedTokensForProductLegacy(productId, indexRows, opts = {}) {
  const pid = Number(productId);
  const documentVersion = Number(opts.documentVersion) || 1;
  const acc = new Map();
  const seoAliases = opts.seoAliases || [];
  for (const row of indexRows) extractFromIndexRow(row, acc, seoAliases);
  return [...acc.values()].map((entry) => ({
    token: entry.token,
    token_type: entry.token_type,
    product_id: pid,
    weight: entry.weight,
    source: entry.source,
    position: entry.position,
    document_version: documentVersion,
  }));
}
