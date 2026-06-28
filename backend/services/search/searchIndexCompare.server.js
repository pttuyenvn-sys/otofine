/**
 * SEARCH-INDEX-SYNC-IMPLEMENT-01 + SEARCH-INDEX-COMPLETE-DOCUMENT-01
 */

import { getProductsColumnsResolved } from "../../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../../modules/products/services/productPublicVisibility.server.js";
import {
  buildSearchIndexDocumentsForProduct,
  normalizeModelKey,
  normalizeYearKey,
} from "./searchIndexDocument.builder.js";
import { computeDocumentHash } from "./searchIndexDocumentHash.js";
import { CURRENT_SEARCH_INDEX_VERSION } from "../../config/searchIndexConfig.js";

function docKey(doc) {
  return `${normalizeModelKey(doc.model_id)}:${normalizeYearKey(doc.year_from)}:${normalizeYearKey(doc.year_to)}`;
}

function rowKey(row) {
  return `${Number(row.model_id) || 0}:${Number(row.year_from) || 0}:${Number(row.year_to) || 0}`;
}

/**
 * @param {import('./searchIndexDocument.builder.js').SearchIndexDocument} doc
 */
function expectedRowFromDoc(doc) {
  return {
    product_id: doc.product_id,
    category_id: doc.category_id,
    category_name: doc.category_name,
    category_slug: doc.category_slug,
    canonical_slug: doc.canonical_slug,
    search_priority: doc.search_priority,
    title: doc.title,
    canonical_path: doc.canonical_path,
    canonical_url: doc.canonical_url,
    thumbnail_url: doc.thumbnail_url,
    brand_id: doc.brand_id,
    brand_name: doc.brand_name,
    brand_slug: doc.brand_slug,
    model_id: normalizeModelKey(doc.model_id),
    model_name: doc.model_name,
    model_slug: doc.model_slug,
    vehicle_label: doc.vehicle_label,
    year_from: normalizeYearKey(doc.year_from),
    year_to: normalizeYearKey(doc.year_to),
    location_id: doc.location_id,
    location_name: doc.location_name,
    shop_name: doc.shop_name,
    price: doc.price,
    stock_status: doc.stock_status,
    part_number: doc.part_number,
    part_number_norm: doc.part_number_norm,
    product_name: doc.product_name,
    search_keywords: doc.search_keywords,
    search_text: doc.search_text,
    popularity_score: doc.popularity_score,
    search_score: doc.search_score,
    status: doc.status,
    document_hash: computeDocumentHash(doc),
    search_version: CURRENT_SEARCH_INDEX_VERSION,
  };
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {number} productId
 */
export async function loadExpectedIndexSnapshot(db, productId) {
  const pc = await getProductsColumnsResolved();
  const pid = pc.idExpr("p");
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });

  const [rows] = await db.query(
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

  if (!rows.length) return { publiclyVisible: false, rows: new Map() };

  const [fitments] = await db.query(
    `
    SELECT pa.carModelId, pa.year_from, pa.year_to, pa.is_primary, cm.hang_xe, cm.ten_xe
    FROM product_car_applications pa
    INNER JOIN car_models cm ON cm.id = pa.carModelId
    WHERE pa.productId = ?
    ORDER BY pa.is_primary DESC, pa.id ASC
    `,
    [productId],
  );

  const [visCheck] = await db.query(
    `
    SELECT ${pid} AS id
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    WHERE ${pid} = ? ${vis.sql}
    LIMIT 1
    `,
    [productId],
  );

  const publiclyVisible = visCheck.length > 0;
  if (!publiclyVisible) {
    return { publiclyVisible: false, rows: new Map() };
  }

  const deduped = [];
  const seen = new Set();
  for (const f of fitments) {
    const k = `${f.carModelId}:${f.year_from ?? ""}:${f.year_to ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(f);
  }

  const docs = buildSearchIndexDocumentsForProduct(rows[0], deduped, { publiclyVisible: true });
  const map = new Map();
  for (const doc of docs) {
    map.set(docKey(doc), expectedRowFromDoc(doc));
  }
  return { publiclyVisible: true, rows: map };
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {number} productId
 */
export async function loadActualIndexSnapshot(db, productId) {
  const [rows] = await db.query(
    `
    SELECT
      product_id, category_id, category_name, category_slug, canonical_slug, search_priority,
      title, canonical_path, canonical_url, thumbnail_url,
      brand_id, brand_name, brand_slug, model_id, model_name, model_slug, vehicle_label,
      year_from, year_to, location_id, location_name, shop_name,
      price, stock_status, part_number, part_number_norm, product_name,
      search_keywords, search_text, popularity_score, search_score,
      status, document_hash, search_version
    FROM product_search_index
    WHERE product_id = ?
    `,
    [productId],
  );
  const map = new Map();
  for (const row of rows) {
    map.set(rowKey(row), row);
  }
  return map;
}

const COMPARE_FIELDS = [
  "category_id",
  "category_name",
  "category_slug",
  "canonical_slug",
  "search_priority",
  "title",
  "canonical_path",
  "canonical_url",
  "thumbnail_url",
  "brand_name",
  "brand_slug",
  "model_name",
  "model_slug",
  "vehicle_label",
  "location_id",
  "location_name",
  "shop_name",
  "price",
  "stock_status",
  "part_number",
  "part_number_norm",
  "product_name",
  "search_keywords",
  "search_text",
  "popularity_score",
  "search_score",
  "status",
  "document_hash",
  "search_version",
];

/** Popup-critical fields for completeness gate. */
export const POPUP_DOCUMENT_FIELDS = [
  "title",
  "thumbnail_url",
  "vehicle_label",
  "price",
  "shop_name",
  "location_name",
  "canonical_url",
  "part_number",
  "stock_status",
];

/**
 * @param {number} productId
 * @param {import('mysql2/promise').Pool} pool
 */
export async function compareProductIndex(pool, productId) {
  const expected = await loadExpectedIndexSnapshot(pool, productId);
  const actual = await loadActualIndexSnapshot(pool, productId);

  if (!expected.publiclyVisible) {
    if (actual.size === 0) return { ok: true, productId, mismatches: [] };
    return {
      ok: false,
      productId,
      mismatches: [{ type: "extra-index-rows", count: actual.size }],
    };
  }

  const mismatches = [];
  for (const [key, exp] of expected.rows) {
    const act = actual.get(key);
    if (!act) {
      mismatches.push({ type: "missing", key });
      continue;
    }
    for (const field of COMPARE_FIELDS) {
      let ev = exp[field] == null ? null : String(exp[field]);
      let av = act[field] == null ? null : String(act[field]);
      if (field === "price") {
        const en = exp[field] == null ? null : Number(exp[field]);
        const an = act[field] == null ? null : Number(act[field]);
        if (en !== an && !(en == null && an == null)) {
          mismatches.push({ type: "field", key, field, expected: ev, actual: av });
        }
        continue;
      }
      if (ev !== av) {
        mismatches.push({ type: "field", key, field, expected: ev, actual: av });
      }
    }
  }
  for (const key of actual.keys()) {
    if (!expected.rows.has(key)) {
      mismatches.push({ type: "extra", key });
    }
  }

  return { ok: mismatches.length === 0, productId, mismatches };
}
