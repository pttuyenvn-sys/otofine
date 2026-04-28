import { normalizeText } from "../utils/normalizeText.js";

/**
 * Alias keywords derived from a `products` row (catalog).
 * @param {Record<string, unknown>} row
 * @returns {string[]}
 */
export function collectProductAliasKeywords(row) {
  const out = new Set();
  const add = (t) => {
    const s = String(t || "").trim();
    if (s) out.add(s);
  };
  add(row.partNumber);
  add(row.partName);
  if (row.slug) add(String(row.slug).replace(/-/g, " "));
  const pn = String(row.partName || "").trim();
  if (pn) {
    const tokens = pn.split(/\s+/).filter(Boolean).slice(0, 4);
    if (tokens.length > 1) add(tokens.join(" "));
  }
  return [...out];
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string|null}
 */
export function buildProductSearchKeywords(row) {
  const parts = [
    row.partNumber,
    row.partName,
    row.origin,
    row.shortDescription && String(row.shortDescription).slice(0, 120),
  ]
    .map((x) => (x != null ? String(x).trim() : ""))
    .filter(Boolean);
  return parts.length ? [...new Set(parts)].join(" | ") : null;
}
