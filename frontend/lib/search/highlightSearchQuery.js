/** SEARCH-UX-REFINEMENT-01 — case-insensitive query token highlighting (Vietnamese-safe). */

/** @deprecated use SEARCH_SUGGEST_PRODUCTS_PER_CATEGORY for multi-block preview */
export const SEARCH_SUGGEST_PREVIEW_LIMIT = 2;

function foldVi(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

/**
 * @param {string} query
 * @returns {{ raw: string, folded: string }[]}
 */
export function tokenizeSearchHighlightQuery(query) {
  return String(query || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, folded: foldVi(raw) }));
}

/**
 * @param {string} text
 * @param {string} query
 * @returns {{ text: string, highlight: boolean }[]}
 */
export function buildSearchHighlightParts(text, query) {
  const tokens = tokenizeSearchHighlightQuery(query);
  const source = String(text ?? "");
  if (!tokens.length) return [{ text: source, highlight: false }];
  if (!source) return [{ text: "", highlight: false }];

  const parts = [];
  const wordRe = /[^\s]+|\s+/g;
  let match;
  while ((match = wordRe.exec(source)) !== null) {
    const chunk = match[0];
    if (/^\s+$/.test(chunk)) {
      parts.push({ text: chunk, highlight: false });
      continue;
    }
    const foldedChunk = foldVi(chunk);
    const highlight = tokens.some((t) => foldedChunk === t.folded);
    parts.push({ text: chunk, highlight });
  }
  return parts;
}
