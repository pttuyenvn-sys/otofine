/**
 * SEARCH-INDEX-ARCHITECTURE-PHASE-01 + SEARCH-INDEX-SYNC-IMPLEMENT-01
 * Sync products → product_search_index (synchronization only — no search runtime reads).
 */

import { pool } from "../../config/db.js";
import { getProductsColumnsResolved } from "../../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../../modules/products/services/productPublicVisibility.server.js";
import { executeBatchValues } from "../../utils/batchUpsert.js";
import {
  CURRENT_SEARCH_INDEX_VERSION,
} from "../../config/searchIndexConfig.js";
import {
  buildSearchIndexDocumentsForProduct,
  normalizeModelKey,
  normalizeYearKey,
} from "./searchIndexDocument.builder.js";
import { computeDocumentHash } from "./searchIndexDocumentHash.js";
import { buildIndexTokenFields } from "./searchIndexDocumentTokens.js";
import { loadSynonymGraph } from "./matcher/searchMatcherSynonymSource.js";
import {
  deleteInvertedTokensForProduct,
  rebuildInvertedIndexForProduct,
} from "./inverted/invertedIndexSync.js";
import { logSearchIndexSync } from "./searchIndexDispatcher.js";

const UPSERT_SQL = `
  INSERT INTO product_search_index (
    product_id, category_id, category_name, category_slug, canonical_slug, search_priority,
    title, canonical_path, canonical_url, thumbnail_url,
    brand_id, brand_name, brand_slug, model_id, model_name, model_slug, vehicle_label,
    year_from, year_to, location_id, location_name, shop_name,
    price, stock_status,
    part_number, part_number_norm, product_name, search_keywords, search_text,
    search_tokens, normalized_tokens, synonym_tokens,
    popularity_score, search_score,
    primary_brand_name, primary_model_name, primary_year_from, primary_year_to,
    status, document_hash, search_version
  ) VALUES ?
  ON DUPLICATE KEY UPDATE
    category_id = VALUES(category_id),
    category_name = VALUES(category_name),
    category_slug = VALUES(category_slug),
    canonical_slug = VALUES(canonical_slug),
    search_priority = VALUES(search_priority),
    title = VALUES(title),
    canonical_path = VALUES(canonical_path),
    canonical_url = VALUES(canonical_url),
    thumbnail_url = VALUES(thumbnail_url),
    brand_id = VALUES(brand_id),
    brand_name = VALUES(brand_name),
    brand_slug = VALUES(brand_slug),
    model_name = VALUES(model_name),
    model_slug = VALUES(model_slug),
    vehicle_label = VALUES(vehicle_label),
    location_id = VALUES(location_id),
    location_name = VALUES(location_name),
    shop_name = VALUES(shop_name),
    price = VALUES(price),
    stock_status = VALUES(stock_status),
    part_number = VALUES(part_number),
    part_number_norm = VALUES(part_number_norm),
    product_name = VALUES(product_name),
    search_keywords = VALUES(search_keywords),
    search_text = VALUES(search_text),
    search_tokens = VALUES(search_tokens),
    normalized_tokens = VALUES(normalized_tokens),
    synonym_tokens = VALUES(synonym_tokens),
    popularity_score = VALUES(popularity_score),
    search_score = VALUES(search_score),
    primary_brand_name = VALUES(primary_brand_name),
    primary_model_name = VALUES(primary_model_name),
    primary_year_from = VALUES(primary_year_from),
    primary_year_to = VALUES(primary_year_to),
    status = VALUES(status),
    document_hash = VALUES(document_hash),
    search_version = VALUES(search_version),
    updated_at = CURRENT_TIMESTAMP(3)
`;

/**
 * @param {import('./searchIndexDocument.builder.js').SearchIndexDocument} doc
 * @param {Map<string, Set<string>>} [synonymGraph]
 */
function documentToUpsertRow(doc, synonymGraph) {
  const tokens = buildIndexTokenFields(doc, synonymGraph);
  const docWithTokens = { ...doc, ...tokens };
  const hash = computeDocumentHash(docWithTokens);
  return [
    doc.product_id,
    doc.category_id,
    doc.category_name,
    doc.category_slug,
    doc.canonical_slug,
    doc.search_priority ?? 0,
    doc.title,
    doc.canonical_path,
    doc.canonical_url,
    doc.thumbnail_url,
    doc.brand_id,
    doc.brand_name,
    doc.brand_slug,
    normalizeModelKey(doc.model_id),
    doc.model_name,
    doc.model_slug,
    doc.vehicle_label,
    normalizeYearKey(doc.year_from),
    normalizeYearKey(doc.year_to),
    doc.location_id,
    doc.location_name,
    doc.shop_name,
    doc.price,
    doc.stock_status,
    doc.part_number,
    doc.part_number_norm,
    doc.product_name,
    doc.search_keywords,
    doc.search_text,
    tokens.search_tokens,
    tokens.normalized_tokens,
    tokens.synonym_tokens,
    doc.popularity_score ?? 0,
    doc.search_score ?? 0,
    doc.primary_brand_name,
    doc.primary_model_name,
    normalizeYearKey(doc.primary_year_from),
    normalizeYearKey(doc.primary_year_to),
    doc.status,
    hash,
    CURRENT_SEARCH_INDEX_VERSION,
  ];
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 */
async function loadProductSource(conn, productId) {
  const pc = await getProductsColumnsResolved();
  const pid = pc.idExpr("p");
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });

  const [rows] = await conn.query(
    `
    SELECT
      ${pid} AS id,
      ${pc.partNumberSqlSelect("p")},
      ${pc.nameSqlSelect("p")},
      ${pc.priceSqlSelect("p")},
      ${pc.stockSqlSelect("p")},
      ${pc.orderExprQualified("p")} AS updatedAt,
      ${pc.shortDescriptionSqlSelect("p")},
      ${pc.descriptionSqlSelect("p")},
      s.name AS shopName,
      s.provinceId,
      a.tinh_tp AS provinceName,
      pcm.category_id,
      pc.category_name,
      pc.canonical_name,
      COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) AS canonical_slug,
      pc.category_slug,
      COALESCE(pc.search_priority, 0) AS search_priority,
      pm.search_keywords AS meta_search_keywords,
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.productId = ${pid}
        ORDER BY pi.isPrimary DESC, pi.id ASC
        LIMIT 1
      ) AS thumbRaw
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    LEFT JOIN address a ON a.id = s.provinceId
    LEFT JOIN product_category_map pcm ON pcm.product_id = ${pid}
    LEFT JOIN product_categories pc ON pc.id = pcm.category_id
    LEFT JOIN product_meta pm ON pm.product_id = ${pid}
    WHERE ${pid} = ?
    ORDER BY pcm.is_primary DESC, pcm.id ASC
    LIMIT 1
    `,
    [productId],
  );

  if (!rows.length) return null;

  const [fitments] = await conn.query(
    `
    SELECT
      pa.id AS application_id,
      pa.carModelId,
      pa.year_from,
      pa.year_to,
      pa.is_primary,
      cm.hang_xe,
      cm.ten_xe
    FROM product_car_applications pa
    INNER JOIN car_models cm ON cm.id = pa.carModelId
    WHERE pa.productId = ?
    ORDER BY pa.is_primary DESC, pa.id ASC
    `,
    [productId],
  );

  const [visCheck] = await conn.query(
    `
    SELECT ${pid} AS id
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    WHERE ${pid} = ? ${vis.sql}
    LIMIT 1
    `,
    [productId],
  );

  return {
    product: rows[0],
    fitments,
    publiclyVisible: visCheck.length > 0,
  };
}

function dedupeFitments(fitmentRows) {
  const deduped = [];
  const seen = new Set();
  for (const f of fitmentRows) {
    const key = `${f.carModelId}:${f.year_from ?? ""}:${f.year_to ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }
  return deduped;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 */
async function loadExistingIndexState(conn, productId) {
  const [rows] = await conn.query(
    `
    SELECT id, model_id, year_from, year_to, document_hash, search_version
    FROM product_search_index
    WHERE product_id = ?
    `,
    [productId],
  );
  /** @type {Map<string, { id: number, hash: string | null, version: number }>} */
  const byKey = new Map();
  for (const row of rows) {
    const key = `${Number(row.model_id) || 0}:${Number(row.year_from) || 0}:${Number(row.year_to) || 0}`;
    byKey.set(key, {
      id: row.id,
      hash: row.document_hash,
      version: Number(row.search_version) || 0,
    });
  }
  return byKey;
}

/**
 * @param {import('./searchIndexDocument.builder.js').SearchIndexDocument[]} docs
 * @param {Map<string, { id: number, hash: string | null, version: number }>} existing
 * @param {boolean} force
 */
function partitionDocumentWrites(docs, existing, force) {
  /** @type {import('./searchIndexDocument.builder.js').SearchIndexDocument[]} */
  const toUpsert = [];
  let hashChanged = false;

  for (const doc of docs) {
    const key = `${normalizeModelKey(doc.model_id)}:${normalizeYearKey(doc.year_from)}:${normalizeYearKey(doc.year_to)}`;
    const hash = computeDocumentHash(doc);
    const prev = existing.get(key);
    const versionStale = !prev || prev.version < CURRENT_SEARCH_INDEX_VERSION;
    const hashDiff = !prev || prev.hash !== hash;
    if (force || hashDiff || versionStale) {
      toUpsert.push(doc);
      if (hashDiff || !prev) hashChanged = true;
    }
  }

  const docKeys = new Set(
    docs.map(
      (d) => `${normalizeModelKey(d.model_id)}:${normalizeYearKey(d.year_from)}:${normalizeYearKey(d.year_to)}`,
    ),
  );
  const staleIds = [];
  for (const [key, row] of existing.entries()) {
    if (!docKeys.has(key)) staleIds.push(row.id);
  }

  const unchanged = toUpsert.length === 0 && staleIds.length === 0;
  return { toUpsert, staleIds, hashChanged, unchanged };
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {import('./searchIndexDocument.builder.js').SearchIndexDocument[]} docs
 */
async function upsertDocuments(conn, docs) {
  if (!docs.length) return 0;
  const synonymGraph = await loadSynonymGraph();
  const rows = docs.map((doc) => documentToUpsertRow(doc, synonymGraph));
  await executeBatchValues(conn, UPSERT_SQL, rows, 100);
  return docs.length;
}

/**
 * @param {number|string} productId
 * @param {{ source?: string, reason?: string, force?: boolean }} [opts]
 */
export async function syncProduct(productId, opts = {}) {
  const started = Date.now();
  const id = Number(productId);
  const source = opts.source || "syncProduct";
  if (!Number.isFinite(id) || id <= 0) {
    return { productId: id, documents: 0, deleted: false, skipped: true };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await loadExistingIndexState(conn, id);
    const sourceData = await loadProductSource(conn, id);

    if (!sourceData) {
      const [del] = await conn.query(`DELETE FROM product_search_index WHERE product_id = ?`, [id]);
      await deleteInvertedTokensForProduct(conn, id);
      await conn.commit();
      logSearchIndexSync({
        source,
        productId: id,
        hashChanged: true,
        action: "delete",
        durationMs: Date.now() - started,
        reason: opts.reason,
      });
      return { productId: id, documents: 0, deleted: true, removed: del.affectedRows || 0 };
    }

    const docs = buildSearchIndexDocumentsForProduct(
      sourceData.product,
      dedupeFitments(sourceData.fitments),
      { publiclyVisible: sourceData.publiclyVisible },
    );

    if (!sourceData.publiclyVisible) {
      const [del] = await conn.query(`DELETE FROM product_search_index WHERE product_id = ?`, [id]);
      await deleteInvertedTokensForProduct(conn, id);
      await conn.commit();
      logSearchIndexSync({
        source,
        productId: id,
        hashChanged: true,
        action: "delete-invisible",
        durationMs: Date.now() - started,
        reason: opts.reason,
      });
      return { productId: id, documents: 0, deleted: true, removed: del.affectedRows || 0 };
    }

    const { toUpsert, staleIds, hashChanged, unchanged } = partitionDocumentWrites(
      docs,
      existing,
      Boolean(opts.force),
    );

    if (unchanged) {
      await conn.commit();
      logSearchIndexSync({
        source,
        productId: id,
        hashChanged: false,
        action: "skip",
        durationMs: Date.now() - started,
        reason: opts.reason,
      });
      return { productId: id, documents: 0, deleted: false, skipped: true };
    }

    const written = await upsertDocuments(conn, toUpsert);
    if (staleIds.length) {
      await conn.query(`DELETE FROM product_search_index WHERE id IN (?)`, [staleIds]);
    }

    const inverted = await rebuildInvertedIndexForProduct(conn, id);

    await conn.commit();
    logSearchIndexSync({
      source,
      productId: id,
      hashChanged,
      action: staleIds.length ? "upsert+delete" : "upsert",
      durationMs: Date.now() - started,
      reason: opts.reason,
      invertedTokens: inverted.tokens ?? 0,
    });
    return {
      productId: id,
      documents: written,
      deleted: false,
      upserted: written,
      pruned: staleIds.length,
      invertedTokens: inverted.tokens ?? 0,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * @param {number|string} productId
 * @param {{ source?: string, reason?: string }} [opts]
 */
export async function deleteProduct(productId, opts = {}) {
  const started = Date.now();
  const id = Number(productId);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `DELETE FROM product_search_index WHERE product_id = ?`,
      [id],
    );
    await deleteInvertedTokensForProduct(conn, id);
    await conn.commit();
    logSearchIndexSync({
      source: opts.source || "deleteProduct",
      productId: id,
      hashChanged: true,
      action: "delete",
      durationMs: Date.now() - started,
      reason: opts.reason,
    });
    return { productId: id, removed: result.affectedRows || 0 };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Vehicle fitment changed — resync product documents. */
export async function syncVehicle(productId, opts = {}) {
  return syncProduct(productId, { ...opts, source: opts.source || "syncVehicle", reason: opts.reason || "fitment" });
}

/** Category mapping changed — resync product documents. */
export async function syncCategory(productId, opts = {}) {
  return syncProduct(productId, { ...opts, source: opts.source || "syncCategory", reason: opts.reason || "category" });
}

/** Visibility gate changed (stock, shop status, etc.). */
export async function syncVisibility(productId, opts = {}) {
  return syncProduct(productId, { ...opts, source: opts.source || "syncVisibility", reason: opts.reason || "visibility" });
}

/** Moderation / approval status changed. */
export async function syncApproval(productId, opts = {}) {
  return syncProduct(productId, { ...opts, source: opts.source || "syncApproval", reason: opts.reason || "approval" });
}

/**
 * @param {number|string} productId
 * @param {{ source?: string, reason?: string, force?: boolean }} [opts]
 */
export async function rebuildProduct(productId, opts = {}) {
  return syncProduct(productId, {
    ...opts,
    source: opts.source || "rebuildProduct",
    force: true,
  });
}

/**
 * Resync all products linked to a car model (internal bulk helper).
 * @param {number|string} carModelId
 */
export async function syncProductsForCarModel(carModelId, opts = {}) {
  const mid = Number(carModelId);
  const [rows] = await pool.query(
    `SELECT DISTINCT productId AS product_id FROM product_car_applications WHERE carModelId = ?`,
    [mid],
  );
  let documents = 0;
  for (const row of rows) {
    const r = await syncProduct(row.product_id, {
      source: opts.source || "syncProductsForCarModel",
      reason: opts.reason || `carModelId=${mid}`,
    });
    documents += r.documents || 0;
  }
  return { carModelId: mid, products: rows.length, documents };
}

/**
 * @param {number|string} categoryId
 */
export async function syncProductsForCategoryId(categoryId, opts = {}) {
  const cid = Number(categoryId);
  const [rows] = await pool.query(
    `SELECT DISTINCT product_id FROM product_category_map WHERE category_id = ?`,
    [cid],
  );
  let documents = 0;
  for (const row of rows) {
    const r = await syncProduct(row.product_id, {
      source: opts.source || "syncProductsForCategoryId",
      reason: opts.reason || `categoryId=${cid}`,
    });
    documents += r.documents || 0;
  }
  return { categoryId: cid, products: rows.length, documents };
}

/**
 * @param {{ batchSize?: number, onProgress?: (info: object) => void, staleVersionOnly?: boolean }} [opts]
 */
export async function rebuildAll(opts = {}) {
  const batchSize = Number(opts.batchSize) || 200;
  const staleOnly = opts.staleVersionOnly !== false;
  const pc = await getProductsColumnsResolved();
  const pid = pc.idExpr("p");
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });

  let versionFilter = "";
  if (staleOnly) {
    versionFilter = `
      AND (
        NOT EXISTS (SELECT 1 FROM product_search_index psi WHERE psi.product_id = ${pid})
        OR EXISTS (
          SELECT 1 FROM product_search_index psi
          WHERE psi.product_id = ${pid} AND psi.search_version < ?
        )
      )
    `;
  }

  const countParams = staleOnly ? [CURRENT_SEARCH_INDEX_VERSION] : [];
  const [[{ total }]] = await pool.query(
    `
    SELECT COUNT(DISTINCT ${pid}) AS total
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    WHERE 1=1 ${vis.sql} ${versionFilter}
    `,
    countParams,
  );

  let lastId = 0;
  let processed = 0;
  let documents = 0;

  while (true) {
    const listParams = staleOnly
      ? [lastId, CURRENT_SEARCH_INDEX_VERSION, batchSize]
      : [lastId, batchSize];
    const [ids] = await pool.query(
      `
      SELECT DISTINCT ${pid} AS id
      FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      WHERE ${pid} > ? ${vis.sql} ${versionFilter}
      ORDER BY ${pid} ASC
      LIMIT ?
      `,
      listParams,
    );
    if (!ids.length) break;

    for (const row of ids) {
      const r = await syncProduct(row.id, {
        source: "rebuildAll",
        force: !staleOnly,
      });
      documents += r.documents || 0;
      processed += 1;
      lastId = row.id;
    }

    opts.onProgress?.({ processed, total: Number(total) || 0, documents, lastId });
  }

  return { products: processed, documents, total: Number(total) || 0 };
}

export const SearchIndexSyncService = {
  syncProduct,
  deleteProduct,
  syncVehicle,
  syncCategory,
  syncVisibility,
  syncApproval,
  rebuildProduct,
  rebuildAll,
  syncProductsForCarModel,
  syncProductsForCategoryId,
};
