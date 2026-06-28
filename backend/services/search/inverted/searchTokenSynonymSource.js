/**
 * SEARCH-INVERTED-INDEX-BUILDER-OPTIMIZATION-01 — depth-1 synonym lookup (dictionary only).
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";
import { cleanBusinessToken } from "./searchTokenGarbageFilter.js";

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').Connection} db
 * @param {{ categoryName?: string | null, seedTerms?: string[] }} ctx
 * @returns {Promise<string[]>}
 */
export async function loadDepthOneSynonyms(db, ctx = {}) {
  const out = new Set();
  const seeds = new Set(
    [ctx.categoryName, ...(ctx.seedTerms || [])]
      .map((t) => cleanBusinessToken(t))
      .filter(Boolean),
  );

  if (ctx.categoryName) {
    try {
      const [rows] = await db.query(
        `
        SELECT match_keyword, canonical_name
        FROM category_dictionary
        WHERE is_active = 1
          AND canonical_name = ?
        `,
        [ctx.categoryName],
      );
      for (const row of rows) {
        const kw = cleanBusinessToken(row.match_keyword);
        const canon = cleanBusinessToken(row.canonical_name);
        if (kw) out.add(kw);
        if (canon) out.add(canon);
      }
    } catch {
      /* optional table */
    }
  }

  if (seeds.size) {
    try {
      const [rows] = await db.query(
        `
        SELECT term, synonym
        FROM search_synonyms
        WHERE is_active = 1
          AND (term IN (?) OR synonym IN (?))
        `,
        [[...seeds], [...seeds]],
      );
      for (const row of rows) {
        const t = cleanBusinessToken(row.term);
        const s = cleanBusinessToken(row.synonym);
        if (t) out.add(t);
        if (s) out.add(s);
      }
    } catch {
      /* optional table */
    }
  }

  for (const seed of seeds) out.delete(seed);
  return [...out];
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').Connection} db
 * @param {string[]} categoryNames
 * @returns {Promise<string[]>}
 */
export async function loadSeoAliasesForCategories(db, categoryNames) {
  const names = [...new Set(categoryNames.map((n) => String(n || "").trim()).filter(Boolean))];
  if (!names.length) return [];
  try {
    const [rows] = await db.query(
      `
      SELECT DISTINCT match_keyword
      FROM category_dictionary
      WHERE is_active = 1 AND canonical_name IN (?)
      `,
      [names],
    );
    return rows
      .map((r) => cleanBusinessToken(r.match_keyword))
      .filter(Boolean);
  } catch {
    return [];
  }
}
