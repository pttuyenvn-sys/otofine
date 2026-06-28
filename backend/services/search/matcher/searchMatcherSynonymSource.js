/**
 * SEARCH-INDEX-MATCHER-01 — synonym graph from DB sources (no hardcoded map).
 */

import { pool } from "../../../config/db.js";
import { foldVi } from "../../../utils/keywordRelevanceRanking.js";

/** @type {{ loadedAt: number, graph: Map<string, Set<string>> } | null} */
let cache = null;
const CACHE_MS = 5 * 60 * 1000;

function linkTerms(graph, terms) {
  const normalized = [...new Set(terms.map((t) => foldVi(t)).filter((t) => t.length >= 2))];
  if (normalized.length < 1) return;
  for (const term of normalized) {
    if (!graph.has(term)) graph.set(term, new Set());
    for (const other of normalized) graph.get(term).add(other);
  }
}

/**
 * @returns {Promise<Map<string, Set<string>>>}
 */
export async function loadSynonymGraph() {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.graph;

  const graph = new Map();

  try {
    const [dictRows] = await pool.query(`
      SELECT match_keyword, canonical_name
      FROM category_dictionary
      WHERE is_active = 1
    `);
    const byCanonical = new Map();
    for (const row of dictRows) {
      const canon = foldVi(row.canonical_name);
      if (!canon) continue;
      if (!byCanonical.has(canon)) byCanonical.set(canon, []);
      byCanonical.get(canon).push(foldVi(row.match_keyword), canon);
    }
    for (const terms of byCanonical.values()) linkTerms(graph, terms);
  } catch {
    /* table may not exist in some envs */
  }

  try {
    const [vehicleRows] = await pool.query(`
      SELECT DISTINCT hang_xe, ten_xe FROM car_models
      WHERE hang_xe IS NOT NULL OR ten_xe IS NOT NULL
    `);
    for (const row of vehicleRows) {
      if (row.hang_xe) linkTerms(graph, [row.hang_xe]);
      if (row.ten_xe) linkTerms(graph, [row.ten_xe]);
      if (row.hang_xe && row.ten_xe) linkTerms(graph, [row.hang_xe, row.ten_xe]);
    }
  } catch {
    /* ignore */
  }

  try {
    const [catRows] = await pool.query(`
      SELECT category_name, canonical_name
      FROM product_categories
      WHERE is_active = 1
    `);
    for (const row of catRows) {
      const terms = [row.category_name, row.canonical_name].filter(Boolean);
      if (terms.length) linkTerms(graph, terms);
    }
  } catch {
    /* ignore */
  }

  try {
    const [synRows] = await pool.query(`
      SELECT term, synonym
      FROM search_synonyms
      WHERE is_active = 1
    `);
    for (const row of synRows) {
      if (row.term && row.synonym) linkTerms(graph, [row.term, row.synonym]);
    }
  } catch {
    /* table optional */
  }

  cache = { loadedAt: Date.now(), graph };
  return graph;
}

/**
 * @param {string[]} tokens
 * @param {Map<string, Set<string>>} graph
 */
export function expandTokensWithSynonyms(tokens, graph) {
  const out = new Set(tokens);
  for (const token of tokens) {
    const syns = graph.get(foldVi(token));
    if (syns) for (const s of syns) out.add(s);
  }
  return [...out].filter((t) => t.length >= 2);
}

export function resetSynonymGraphCache() {
  cache = null;
}
