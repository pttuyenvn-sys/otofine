import { pool } from "../config/db.js";
import { logError, logInfo, logWarn } from "../utils/syncLogger.js";
import { normalizeText } from "../utils/normalizeText.js";
import {
  collectProductAliasKeywords,
  buildProductSearchKeywords,
} from "./productDerive.shared.js";
import { withTransaction } from "../utils/mysqlTransaction.js";
import { executeBatchValues } from "../utils/batchUpsert.js";

const SCOPE = "productService";
const FITMENT_SOURCE = "product_car_applications";

/**
 * @param {Record<string, unknown>} row
 */
function buildProductMetaPayload(row) {
  const partName = row.partName != null ? String(row.partName) : null;
  return {
    slug: row.slug != null ? String(row.slug) : null,
    search_keywords: buildProductSearchKeywords(row),
    normalized_name: partName
      ? normalizeText(partName, {
          semantic: true,
          stripBrands: process.env.NORMALIZE_STRIP_BRANDS === "1",
        })
      : null,
    oem_brand: null,
    quality_grade: null,
    install_position: null,
    life_cycle_km: null,
    priority_score: null,
  };
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 * @param {Record<string, unknown>} row
 */
export async function rebuildProductAliasesForProduct(conn, productId, row) {
  const keys = collectProductAliasKeywords(row);
  await conn.query(`DELETE FROM product_aliases WHERE product_id = ?`, [productId]);
  if (!keys.length) return 0;
  await executeBatchValues(
    conn,
    `INSERT INTO product_aliases (product_id, keyword) VALUES ?
     ON DUPLICATE KEY UPDATE keyword = VALUES(keyword)`,
    keys.map((keyword) => [productId, keyword]),
  );
  return keys.length;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 * @param {Record<string, unknown>} row
 */
export async function rebuildProductMetaForProduct(conn, productId, row) {
  const m = buildProductMetaPayload(row);
  await conn.query(
    `INSERT INTO product_meta (
       product_id, slug, search_keywords, normalized_name, oem_brand,
       quality_grade, install_position, life_cycle_km, priority_score
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       slug = VALUES(slug),
       search_keywords = VALUES(search_keywords),
       normalized_name = VALUES(normalized_name),
       oem_brand = VALUES(oem_brand),
       quality_grade = VALUES(quality_grade),
       install_position = VALUES(install_position),
       life_cycle_km = VALUES(life_cycle_km),
       priority_score = VALUES(priority_score)`,
    [
      productId,
      m.slug,
      m.search_keywords,
      m.normalized_name,
      m.oem_brand,
      m.quality_grade,
      m.install_position,
      m.life_cycle_km,
      m.priority_score,
    ],
  );
  return 1;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 */
export async function rebuildProductFitmentScores(conn, productId) {
  const [apps] = await conn.query(
    `SELECT carModelId, year_from, year_to FROM product_car_applications WHERE productId = ?`,
    [productId],
  );
  const rows = apps.map((a) => {
    const cmId = a.carModelId;
    const score = 1;
    return [productId, cmId, score, FITMENT_SOURCE];
  });
  await conn.query(`DELETE FROM product_fitment_score WHERE product_id = ?`, [productId]);
  if (!rows.length) return 0;
  await executeBatchValues(
    conn,
    `INSERT INTO product_fitment_score (product_id, car_model_id, score, source) VALUES ?
     ON DUPLICATE KEY UPDATE score = VALUES(score), source = VALUES(source)`,
    rows,
  );
  return rows.length;
}

/**
 * @param {number|string} productId
 * @returns {Promise<{ aliases: number, meta: number, fitment: number }>}
 */
export async function syncProduct(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error("Invalid productId");
    logError(SCOPE, err.message, { productId });
    throw err;
  }

  const [[row]] = await pool.query(`SELECT * FROM products WHERE id = ? LIMIT 1`, [id]);
  if (!row) {
    logWarn(SCOPE, "product not found", { productId: id });
    return { aliases: 0, meta: 0, fitment: 0 };
  }

  try {
    return await withTransaction(pool, async (conn) => {
      const aliases = await rebuildProductAliasesForProduct(conn, id, row);
      const meta = await rebuildProductMetaForProduct(conn, id, row);
      const fitment = await rebuildProductFitmentScores(conn, id);
      logInfo(SCOPE, "syncProduct done", { productId: id, aliases, meta, fitment });
      const { queueSearchIndexSync } = await import("./search/searchIndexDispatcher.js");
      queueSearchIndexSync(id, { source: "productService.syncProduct", reason: "keywords" });
      return { aliases, meta, fitment };
    });
  } catch (e) {
    logError(SCOPE, e instanceof Error ? e.message : String(e), {
      productId: id,
      code: e?.code,
    });
    throw e;
  }
}
