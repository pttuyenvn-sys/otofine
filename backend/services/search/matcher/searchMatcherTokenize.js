/**
 * SEARCH-INDEX-MATCHER-01 — tokenization (single, phrase, compound).
 */

const MIN_TOKEN_LEN = 2;

function splitWords(folded) {
  return String(folded || "")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= MIN_TOKEN_LEN);
}

/**
 * @param {string} folded — already foldVi normalized string
 * @returns {{ single: string[], phrases: string[], all: string[] }}
 */
export function tokenizeMatcherQuery(folded) {
  const words = splitWords(folded);
  const single = [...new Set(words)];
  const phrases = [];

  for (let n = Math.min(4, words.length); n >= 2; n -= 1) {
    for (let i = 0; i <= words.length - n; i += 1) {
      phrases.push(words.slice(i, i + n).join(" "));
    }
  }

  const all = [...new Set([...single, ...phrases])];
  return { single, phrases, all };
}

/**
 * @param {string} folded
 */
export function tokenizeDocumentField(folded) {
  return tokenizeMatcherQuery(folded).all;
}
