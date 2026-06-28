/**
 * SEARCH-INVERTED-INDEX-BUILDER-OPTIMIZATION-01 — configurable stop words.
 */

import { foldVi } from "../utils/keywordRelevanceRanking.js";

const DEFAULT_STOP_WORDS = [
  "xe",
  "o to",
  "oto",
  "va",
  "cua",
  "cho",
  "voi",
  "chinh hang",
  "genuine",
  "new",
  "hang",
  "san",
  "pham",
  "bo",
  "cai",
  "mot",
  "cua hang",
  "shop",
  "the",
  "and",
  "for",
  "with",
  "from",
];

/** @type {Set<string> | null} */
let cache = null;

export function getSearchTokenStopWords() {
  if (cache) return cache;
  const extra = String(process.env.SEARCH_TOKEN_STOP_WORDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const all = [...DEFAULT_STOP_WORDS, ...extra].map((w) => foldVi(w));
  cache = new Set(all.filter(Boolean));
  return cache;
}

export function resetSearchTokenStopWordsCache() {
  cache = null;
}

export function isStopWord(token) {
  const t = foldVi(String(token || "").trim());
  if (!t) return true;
  return getSearchTokenStopWords().has(t);
}
