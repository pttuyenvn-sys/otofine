/**
 * SEARCH-INVERTED-INDEX-01 — read-only inverted index access (not wired to runtime).
 */

import { pool } from "../../../config/db.js";
import { foldVi } from "../../../utils/keywordRelevanceRanking.js";

/**
 * @typedef {object} TokenHit
 * @property {number} product_id
 * @property {string} token
 * @property {string} token_type
 * @property {number} weight
 * @property {string} source
 */

/**
 * @param {string} token
 * @param {{ tokenType?: string, limit?: number }} [opts]
 * @returns {Promise<TokenHit[]>}
 */
export async function findByToken(token, opts = {}) {
  const folded = foldVi(String(token || "").trim());
  if (!folded) return [];

  let sql = `
    SELECT product_id, token, token_type, weight, source
    FROM search_token_index
    WHERE token = ?
  `;
  const params = [folded];

  if (opts.tokenType) {
    sql += ` AND token_type = ? `;
    params.push(String(opts.tokenType));
  }

  sql += ` ORDER BY weight DESC, product_id ASC `;
  if (opts.limit != null) {
    sql += ` LIMIT ? `;
    params.push(Number(opts.limit));
  }

  const [rows] = await pool.query(sql, params);
  return rows.map(mapHit);
}

/**
 * @param {string[]} tokens
 * @param {{ tokenTypes?: string[], limit?: number }} [opts]
 * @returns {Promise<TokenHit[]>}
 */
export async function findByTokens(tokens, opts = {}) {
  const folded = [...new Set(tokens.map((t) => foldVi(String(t || "").trim())).filter(Boolean))];
  if (!folded.length) return [];

  let sql = `
    SELECT product_id, token, token_type, weight, source
    FROM search_token_index
    WHERE token IN (?)
  `;
  const params = [folded];

  if (opts.tokenTypes?.length) {
    sql += ` AND token_type IN (?) `;
    params.push(opts.tokenTypes);
  }

  sql += ` ORDER BY weight DESC, product_id ASC `;
  if (opts.limit != null) {
    sql += ` LIMIT ? `;
    params.push(Number(opts.limit));
  }

  const [rows] = await pool.query(sql, params);
  return rows.map(mapHit);
}

/**
 * Product IDs present in every input set.
 * @param {Array<Iterable<number> | number[]>} productIdSets
 * @returns {number[]}
 */
export function intersect(productIdSets) {
  const sets = productIdSets.map((s) => new Set(s));
  if (!sets.length) return [];
  const [first, ...rest] = sets;
  const out = [];
  for (const id of first) {
    if (rest.every((set) => set.has(id))) out.push(Number(id));
  }
  return out;
}

/**
 * @param {Array<Iterable<number> | number[]>} productIdSets
 * @returns {number[]}
 */
export function union(productIdSets) {
  const out = new Set();
  for (const set of productIdSets) {
    for (const id of set) out.add(Number(id));
  }
  return [...out];
}

/**
 * Rank candidates by summed token weight.
 * @param {number[]} productIds
 * @param {{ hits?: TokenHit[], limit?: number }} [opts]
 * @returns {Promise<Array<{ product_id: number, score: number }>>}
 */
export async function topCandidates(productIds, opts = {}) {
  const ids = [...new Set(productIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return [];

  if (opts.hits?.length) {
    return rankFromHits(ids, opts.hits, opts.limit);
  }

  const [rows] = await pool.query(
    `
    SELECT product_id, SUM(weight) AS score
    FROM search_token_index
    WHERE product_id IN (?)
    GROUP BY product_id
    ORDER BY score DESC, product_id ASC
    ${opts.limit != null ? "LIMIT ?" : ""}
    `,
    opts.limit != null ? [ids, Number(opts.limit)] : [ids],
  );

  return rows.map((r) => ({
    product_id: Number(r.product_id),
    score: Number(r.score) || 0,
  }));
}

/**
 * @param {number[]} productIds
 * @param {TokenHit[]} hits
 * @param {number} [limit]
 */
function rankFromHits(productIds, hits, limit) {
  const allowed = new Set(productIds);
  /** @type {Map<number, number>} */
  const scores = new Map();
  for (const hit of hits) {
    const pid = Number(hit.product_id);
    if (!allowed.has(pid)) continue;
    scores.set(pid, (scores.get(pid) || 0) + Number(hit.weight || 0));
  }
  const ranked = [...scores.entries()]
    .map(([product_id, score]) => ({ product_id, score }))
    .sort((a, b) => b.score - a.score || a.product_id - b.product_id);
  return limit != null ? ranked.slice(0, limit) : ranked;
}

function mapHit(row) {
  return {
    product_id: Number(row.product_id),
    token: String(row.token),
    token_type: String(row.token_type),
    weight: Number(row.weight) || 0,
    source: String(row.source || ""),
  };
}

/**
 * SQL candidate retrieval — search_token_index only.
 * @param {string[]} tokens
 * @param {number} [limit]
 */
export async function fetchCandidatesByTokens(tokens, limit = 500) {
  const folded = [...new Set(tokens.map((t) => foldVi(String(t || "").trim())).filter((t) => t.length >= 2))];
  if (!folded.length) return [];

  const [rows] = await pool.query(
    `
    SELECT
      product_id,
      COUNT(DISTINCT token) AS matched_tokens,
      SUM(weight) AS score
    FROM search_token_index
    WHERE token IN (?)
    GROUP BY product_id
    ORDER BY matched_tokens DESC, score DESC, product_id ASC
    LIMIT ?
    `,
    [folded, limit],
  );

  return rows.map((r) => ({
    product_id: Number(r.product_id),
    matched_tokens: Number(r.matched_tokens) || 0,
    score: Number(r.score) || 0,
  }));
}

export const SearchTokenRepository = {
  findByToken,
  findByTokens,
  intersect,
  union,
  topCandidates,
  fetchCandidatesByTokens,
};
