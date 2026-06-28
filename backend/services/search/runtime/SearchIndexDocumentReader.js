/**
 * SEARCH-INDEX-POPUP-RUNTIME-01 — read popup card fields from product_search_index only.
 * No JOIN to products, shops, images, fitment, or categories.
 */

import { pool } from "../../../config/db.js";

function fold(s) {
  return String(s || "").trim().toLowerCase();
}

function normalizeYear(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {object} doc
 * @param {object} key
 */
function documentMatchesKey(doc, key) {
  if (Number(doc.product_id) !== Number(key.product_id)) return false;
  if (String(doc.category_name || "") !== String(key.canonical_name || "")) return false;
  if (fold(doc.brand_name) !== fold(key.brand)) return false;
  if (fold(doc.model_name) !== fold(key.model)) return false;

  const keyFrom = normalizeYear(key.fitment_year_from);
  const keyTo = normalizeYear(key.fitment_year_to);
  if (keyFrom != null && normalizeYear(doc.year_from) !== keyFrom) return false;
  if (keyTo != null && normalizeYear(doc.year_to) !== keyTo) return false;
  return true;
}

/**
 * @param {object} doc
 */
function mapDocumentToPreviewRow(doc) {
  const yearFrom = normalizeYear(doc.primary_year_from) ?? normalizeYear(doc.year_from);
  const yearTo = normalizeYear(doc.primary_year_to) ?? normalizeYear(doc.year_to);
  const popularity = Number(doc.popularity_score);
  return {
    id: Number(doc.product_id),
    partName: doc.product_name,
    partNumber: doc.part_number,
    price: doc.price != null ? Number(doc.price) : null,
    stock: doc.stock_status === "in_stock" ? 1 : 0,
    updatedAt: Number.isFinite(popularity) && popularity > 0
      ? new Date(popularity).toISOString()
      : null,
    shopName: doc.shop_name,
    provinceName: doc.location_name,
    imageUrl: doc.thumbnail_url,
    canonical_name: doc.category_name,
    brand: doc.brand_name,
    model: doc.model_name,
    fitment_brand: doc.primary_brand_name || doc.brand_name,
    fitment_model: doc.primary_model_name || doc.model_name,
    fitment_year_from: yearFrom,
    fitment_year_to: yearTo,
    fitment_is_primary: 1,
  };
}

/**
 * @typedef {object} PreviewIndexKey
 * @property {number} product_id
 * @property {string} [canonical_name]
 * @property {string} [brand]
 * @property {string} [model]
 * @property {number | null} [fitment_year_from]
 * @property {number | null} [fitment_year_to]
 */

export const SearchIndexDocumentReader = {
  /**
   * Load popup-render fields for matched preview keys (single index query, no JOINs).
   * @param {PreviewIndexKey[]} indexRows
   * @returns {Promise<object[]>} rows compatible with mapPreviewProductRow
   */
  async readForPreview(indexRows) {
    const keys = (indexRows || []).filter((r) => Number.isFinite(Number(r.product_id)));
    if (!keys.length) return [];

    const ids = [...new Set(keys.map((r) => Number(r.product_id)))];
    const [docs] = await pool.query(
      `
      SELECT
        product_id,
        category_name,
        brand_name,
        model_name,
        year_from,
        year_to,
        product_name,
        part_number,
        price,
        stock_status,
        shop_name,
        location_name,
        thumbnail_url,
        title,
        canonical_path,
        canonical_url,
        popularity_score,
        primary_brand_name,
        primary_model_name,
        primary_year_from,
        primary_year_to
      FROM product_search_index
      WHERE product_id IN (?) AND status = 'active'
      `,
      [ids],
    );

    const used = new Set();
    const out = [];

    for (const key of keys) {
      let doc = docs.find((d) => documentMatchesKey(d, key));
      if (!doc) {
        doc = docs.find(
          (d) => Number(d.product_id) === Number(key.product_id)
            && String(d.category_name || "") === String(key.canonical_name || "")
            && fold(d.brand_name) === fold(key.brand)
            && fold(d.model_name) === fold(key.model),
        );
      }
      if (!doc) continue;

      const dedupeKey = `${doc.product_id}:${doc.category_name}:${doc.brand_name}:${doc.model_name}:${doc.year_from}:${doc.year_to}`;
      if (used.has(dedupeKey)) continue;
      used.add(dedupeKey);
      out.push(mapDocumentToPreviewRow(doc));
    }

    return out;
  },
};

/** @deprecated use SearchIndexDocumentReader.readForPreview */
export async function readIndexDocumentsForPreview(indexRows) {
  return SearchIndexDocumentReader.readForPreview(indexRows);
}
