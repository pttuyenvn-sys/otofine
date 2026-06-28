/**
 * MySQL FULLTEXT on product text fields only (not vehicle facets).
 */

import {
  buildKeywordRelevanceOrderSql,
  normalizeSearchText,
} from "../../../utils/keywordRelevanceRanking.js";

/** @type {boolean | null} */
let fulltextAvailable = null;

/**
 * @param {import('../../../config/db.js').pool} pool
 */
export async function detectFulltextIndexes(pool) {
  if (fulltextAvailable != null) return fulltextAvailable;
  try {
    const db = process.env.DB_NAME;
    const [rows] = await pool.query(
      `
      SELECT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND (
          (TABLE_NAME = 'products' AND INDEX_NAME = 'ft_products_search_text')
          OR (TABLE_NAME = 'product_meta' AND INDEX_NAME = 'ft_product_meta_keywords')
        )
        AND INDEX_TYPE = 'FULLTEXT'
      `,
      [db],
    );
    fulltextAvailable = rows.length >= 1;
  } catch {
    fulltextAvailable = false;
  }
  return fulltextAvailable;
}

export function resetFulltextDetection() {
  fulltextAvailable = null;
}

/**
 * @param {Awaited<ReturnType<typeof import('../../../utils/productsTableColumns.server.js').getProductsColumnsResolved>>} pc
 * @param {string} textQuery
 */
export function buildFulltextSearchClause(pc, textQuery) {
  const kw = normalizeSearchText(textQuery);
  const words = kw.split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) {
    return { where: "", params: [], keywordOrder: "", active: false, needsProductMetaJoin: false };
  }

  const pn = pc.partNumberExpr("p");
  const title = pc.partNameExpr("p");
  const sd = pc.shortDescriptionExpr("p");
  const de = pc.descriptionExpr("p");

  const booleanQuery = words.map((w) => `+${w}*`).join(" ");

  const where = `
    AND (
      MATCH(${title}, ${sd}, ${de}) AGAINST (? IN BOOLEAN MODE)
      OR MATCH(pm.search_keywords) AGAINST (? IN BOOLEAN MODE)
    )
  `;

  const relevanceCase = buildKeywordRelevanceOrderSql({
    titleExpr: title,
    partNumberExpr: pn,
    shortDescExpr: sd,
    descExpr: de,
    query: kw,
  });

  return {
    where,
    params: [booleanQuery, booleanQuery],
    keywordOrder: relevanceCase ? `${relevanceCase},` : "",
    active: true,
    needsProductMetaJoin: true,
  };
}
