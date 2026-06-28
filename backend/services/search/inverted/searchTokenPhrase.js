/**
 * SEARCH-INVERTED-INDEX-BUILDER-OPTIMIZATION-01 — adjacent phrase n-grams (max 3).
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";
import { isStopWord } from "../../../config/searchTokenStopWords.js";
import { cleanBusinessToken } from "./searchTokenGarbageFilter.js";

const MIN_WORD_LEN = 2;
const MAX_NGRAM = 3;

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeWords(text) {
  const folded = foldVi(String(text || "").trim());
  if (!folded) return [];
  return folded
    .split(/\s+/)
    .map((w) => cleanBusinessToken(w))
    .filter((w) => w && w.length >= MIN_WORD_LEN && !isStopWord(w));
}

/**
 * Adjacent phrases only (2-gram and 3-gram), no permutations.
 * @param {string[]} words
 * @param {number} [maxN]
 * @returns {string[]}
 */
export function adjacentPhrases(words, maxN = MAX_NGRAM) {
  const list = words.filter(Boolean);
  const out = [];
  const cap = Math.min(maxN, 3, list.length);
  for (let n = 2; n <= cap; n += 1) {
    for (let i = 0; i <= list.length - n; i += 1) {
      out.push(list.slice(i, i + n).join(" "));
    }
  }
  return [...new Set(out)];
}

/**
 * @param {string} text
 * @returns {{ words: string[], phrases: string[] }}
 */
export function tokenizeTextForIndex(text) {
  const words = tokenizeWords(text);
  return { words: [...new Set(words)], phrases: adjacentPhrases(words) };
}
