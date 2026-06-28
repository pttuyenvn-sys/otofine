/**
 * SEARCH-INVERTED-INDEX-BUILDER-OPTIMIZATION-01 — per-product inverted index sync.
 */

import { CURRENT_SEARCH_INDEX_VERSION } from "../../../config/searchIndexConfig.js";
import { isSearchInvertedIndexEnabled } from "../../../config/searchInvertedIndexConfig.js";
import { executeBatchValues } from "../../../utils/batchUpsert.js";
import { ensureSearchTokenIndexSchema } from "./ensureSearchTokenIndexSchema.js";
import {
  buildInvertedTokensForProduct,
  loadSeoAliasesForCategories,
  loadDepthOneSynonyms,
} from "./SearchTokenIndexBuilder.js";
import { computeInvertedTokenSetHash } from "./searchTokenSetHash.js";

const INSERT_SQL = `
  INSERT INTO search_token_index (
    token, token_type, product_id, weight, source, position, document_version
  ) VALUES ?
`;

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 */
export async function deleteInvertedTokensForProduct(conn, productId) {
  const [result] = await conn.query(
    `DELETE FROM search_token_index WHERE product_id = ?`,
    [Number(productId)],
  );
  return result.affectedRows || 0;
}

async function readExistingTokenHash(conn, productId) {
  const [rows] = await conn.query(
    `SELECT inverted_token_hash FROM product_search_index WHERE product_id = ? AND inverted_token_hash IS NOT NULL LIMIT 1`,
    [Number(productId)],
  );
  return rows.length ? String(rows[0].inverted_token_hash || "") : null;
}

async function persistTokenHash(conn, productId, hash) {
  await conn.query(
    `UPDATE product_search_index SET inverted_token_hash = ? WHERE product_id = ?`,
    [hash, Number(productId)],
  );
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 */
export async function rebuildInvertedIndexForProduct(conn, productId) {
  if (!isSearchInvertedIndexEnabled()) {
    return { skipped: true };
  }

  await ensureSearchTokenIndexSchema(conn);
  const pid = Number(productId);

  const [indexRows] = await conn.query(
    `SELECT * FROM product_search_index WHERE product_id = ? AND status = 'active'`,
    [pid],
  );

  if (!indexRows.length) {
    await deleteInvertedTokensForProduct(conn, pid);
    return { tokens: 0, removed: 0, hashSkipped: false };
  }

  const primary = indexRows[0];
  const categoryNames = [primary.category_name].filter(Boolean);
  const seoAliases = await loadSeoAliasesForCategories(conn, categoryNames);
  const titleWords = String(primary.title || primary.product_name || "")
    .split(/\s+/)
    .slice(0, 12);

  const dictionarySynonyms = await loadDepthOneSynonyms(conn, {
    categoryName: primary.category_name,
    seedTerms: [
      primary.category_name,
      primary.brand_name,
      primary.model_name,
      ...titleWords,
    ],
  });

  const tokenRows = buildInvertedTokensForProduct(pid, indexRows, {
    documentVersion: CURRENT_SEARCH_INDEX_VERSION,
    seoAliases,
    dictionarySynonyms,
  });

  const tokenHash = computeInvertedTokenSetHash(tokenRows);
  const existingHash = await readExistingTokenHash(conn, pid);
  if (existingHash && existingHash === tokenHash) {
    return { tokens: tokenRows.length, skipped: true, hashSkipped: true, tokenHash };
  }

  await deleteInvertedTokensForProduct(conn, pid);

  if (tokenRows.length) {
    const values = tokenRows.map((r) => [
      r.token,
      r.token_type,
      r.product_id,
      r.weight,
      r.source,
      r.position,
      r.document_version,
    ]);
    await executeBatchValues(conn, INSERT_SQL, values, 200);
  }

  await persistTokenHash(conn, pid, tokenHash);

  return { tokens: tokenRows.length, removed: 0, hashSkipped: false, tokenHash };
}

export const InvertedIndexSync = {
  rebuildInvertedIndexForProduct,
  deleteInvertedTokensForProduct,
};
