/**
 * Indexed equality for part number, OEM code, and canonical slug.
 */

import {
  buildKeywordRelevanceOrderSql,
} from "../../../utils/keywordRelevanceRanking.js";
import { normalizePartNumber } from "../../../utils/listingQueryNormalize.js";

/**
 * @param {import('../../../utils/productsTableColumns.server.js').getProductsColumnsResolved extends () => Promise<infer T> ? T : never} pc
 * @param {{ partNumber?: string, slugCandidate?: string }} facets
 */
export function buildExactSearchClause(pc, facets) {
  const partNumber = String(facets.partNumber || "").trim();
  const slug = String(facets.slugCandidate || "").trim();
  if (!partNumber && !slug) {
    return { where: "", params: [], keywordOrder: "", active: false };
  }

  const pn = pc.partNumberExpr("p");
  const title = pc.partNameExpr("p");
  const sd = pc.shortDescriptionExpr("p");
  const de = pc.descriptionExpr("p");
  const clauses = [];
  const params = [];

  if (partNumber) {
    const normalized = normalizePartNumber(partNumber);
    clauses.push(
      `REPLACE(REPLACE(LOWER(${pn}), '-', ''), ' ', '') = ?`,
    );
    params.push(normalized);
    clauses.push(`LOWER(TRIM(${pn})) = ?`);
    params.push(partNumber.toLowerCase());
  }

  if (slug) {
    clauses.push(`(pm.slug = ? OR LOWER(TRIM(pm.slug)) = ?)`);
    params.push(slug, slug.toLowerCase());
  }

  const query = partNumber || slug;
  const relevanceCase = buildKeywordRelevanceOrderSql({
    titleExpr: title,
    partNumberExpr: pn,
    shortDescExpr: sd,
    descExpr: de,
    query,
  });

  return {
    where: ` AND (${clauses.join(" OR ")}) `,
    params,
    keywordOrder: relevanceCase ? `${relevanceCase},` : "",
    active: true,
    needsProductMetaJoin: Boolean(slug),
  };
}
