/**
 * SEARCH-INDEX-ARCHITECTURE-PHASE-01 + SEARCH-INDEX-COMPLETE-DOCUMENT-01
 * Build denormalized search index documents (popup-ready fields).
 */

import { buildProductSearchKeywords } from "../productDerive.shared.js";
import { normalizePartNumber } from "../../utils/listingQueryNormalize.js";
import { slugifyVi } from "../../utils/slugifyVi.server.js";
import {
  buildProductIdentity,
  buildYearSegment,
  pickPrimaryFitment,
} from "../../../frontend/lib/identity/buildProductIdentity.js";

/**
 * @typedef {object} SearchIndexDocument
 * @property {number} product_id
 * @property {number | null} category_id
 * @property {string | null} category_name
 * @property {string | null} category_slug
 * @property {string | null} canonical_slug
 * @property {number} search_priority
 * @property {string | null} title
 * @property {string | null} canonical_path
 * @property {string | null} canonical_url
 * @property {string | null} thumbnail_url
 * @property {number | null} brand_id
 * @property {string | null} brand_name
 * @property {string | null} brand_slug
 * @property {number | null} model_id
 * @property {string | null} model_name
 * @property {string | null} model_slug
 * @property {string | null} vehicle_label
 * @property {number | null} year_from
 * @property {number | null} year_to
 * @property {number | null} location_id
 * @property {string | null} location_name
 * @property {string | null} shop_name
 * @property {number | null} price
 * @property {'in_stock' | 'out_of_stock'} stock_status
 * @property {string | null} part_number
 * @property {string | null} part_number_norm
 * @property {string | null} product_name
 * @property {string | null} search_keywords
 * @property {string | null} search_text
 * @property {number} popularity_score
 * @property {string | null} primary_brand_name
 * @property {string | null} primary_model_name
 * @property {number | null} primary_year_from
 * @property {number | null} primary_year_to
 * @property {number} search_score
 * @property {'active' | 'inactive'} status
 */

function cleanStr(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

function normalizeThumbnailUrl(raw) {
  if (!raw) return null;
  const u = String(raw).trim();
  if (!u) return null;
  if (u.startsWith("http")) return u;
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) return u;
  return `${base}/${decodeURIComponent(u).replace(/^\/+/, "")}`;
}

function buildStockStatus(stock) {
  const n = Number(stock);
  return Number.isFinite(n) && n > 0 ? "in_stock" : "out_of_stock";
}

function popularityFromUpdatedAt(updatedAt) {
  if (!updatedAt) return 0;
  const ms = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(String(updatedAt));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * @param {string | null | undefined} brand
 * @param {string | null | undefined} model
 * @param {number | null | undefined} yearFrom
 * @param {number | null | undefined} yearTo
 */
export function buildVehicleLabel(brand, model, yearFrom, yearTo) {
  const b = cleanStr(brand);
  const m = cleanStr(model);
  if (!b && !m) return null;
  const yearPart = buildYearSegment(yearFrom, yearTo);
  return [b, m, yearPart].filter(Boolean).join(" ");
}

/**
 * Build search_text from product text fields only (not vehicle tokens in FULLTEXT field).
 * @param {object} parts
 */
export function buildSearchText(parts) {
  const chunks = [
    parts.part_number,
    parts.product_name,
    parts.search_keywords,
    parts.short_description,
    parts.description,
  ]
    .map((x) => (x != null ? String(x).trim() : ""))
    .filter(Boolean);
  return chunks.length ? chunks.join(" ") : null;
}

/**
 * @param {object} productRow — base product + shop + primary category + image
 * @param {object | null} fitmentRow — car application + car_models
 * @param {{ publiclyVisible: boolean, primaryFitment?: object | null }} opts
 * @returns {SearchIndexDocument}
 */
export function buildSearchIndexDocument(productRow, fitmentRow, opts = { publiclyVisible: true }) {
  const partNumber = cleanStr(productRow.partNumber);
  const productName = cleanStr(productRow.partName);
  const searchKeywords =
    cleanStr(productRow.meta_search_keywords)
    || buildProductSearchKeywords(productRow)
    || null;

  const categoryName = cleanStr(
    productRow.canonical_name || productRow.category_name,
  );
  const categorySlug = cleanStr(
    productRow.canonical_slug || productRow.category_slug,
  );
  const searchPriority = Number(productRow.search_priority) || 0;
  const brandName = fitmentRow ? cleanStr(fitmentRow.hang_xe) : null;
  const modelName = fitmentRow ? cleanStr(fitmentRow.ten_xe) : null;
  const yearFrom = fitmentRow?.year_from != null ? Number(fitmentRow.year_from) : null;
  const yearTo = fitmentRow?.year_to != null ? Number(fitmentRow.year_to) : null;

  const fitmentForIdentity = fitmentRow
    ? {
        hang_xe: brandName,
        ten_xe: modelName,
        year_from: yearFrom,
        year_to: yearTo,
        is_primary: fitmentRow.is_primary ?? 1,
      }
    : null;

  const primary = opts.primaryFitment || null;
  const primaryBrand = primary ? cleanStr(primary.hang_xe || primary.brand) : brandName;
  const primaryModel = primary ? cleanStr(primary.ten_xe || primary.model) : modelName;
  const primaryYearFrom = primary?.year_from != null ? Number(primary.year_from) : yearFrom;
  const primaryYearTo = primary?.year_to != null ? Number(primary.year_to) : yearTo;

  const identity = buildProductIdentity(
    { id: productRow.id, partName: productName, partNumber },
    primary
      ? {
          hang_xe: primaryBrand,
          ten_xe: primaryModel,
          year_from: primaryYearFrom,
          year_to: primaryYearTo,
          is_primary: 1,
        }
      : fitmentForIdentity,
  );

  const searchText = buildSearchText({
    part_number: partNumber,
    product_name: productName,
    search_keywords: searchKeywords,
    short_description: productRow.shortDescription,
    description: productRow.description,
  });

  const priceRaw = productRow.price != null ? Number(productRow.price) : null;
  const price = Number.isFinite(priceRaw) ? priceRaw : null;
  const popularityScore = popularityFromUpdatedAt(productRow.updatedAt);

  return {
    product_id: Number(productRow.id),
    category_id: productRow.category_id != null ? Number(productRow.category_id) : null,
    category_name: categoryName,
    category_slug: categorySlug,
    canonical_slug: categorySlug,
    search_priority: searchPriority,
    title: cleanStr(identity.h1) || productName,
    canonical_path: cleanStr(identity.canonicalPath),
    canonical_url: cleanStr(identity.canonicalUrl),
    thumbnail_url: normalizeThumbnailUrl(productRow.thumbRaw || productRow.imageUrl),
    brand_id: null,
    brand_name: brandName,
    brand_slug: brandName ? slugifyVi(brandName) || null : null,
    model_id: fitmentRow?.carModelId != null ? Number(fitmentRow.carModelId) : null,
    model_name: modelName,
    model_slug: modelName ? slugifyVi(modelName) || null : null,
    vehicle_label: buildVehicleLabel(brandName, modelName, yearFrom, yearTo),
    year_from: yearFrom,
    year_to: yearTo,
    location_id: productRow.provinceId != null ? Number(productRow.provinceId) : null,
    location_name: cleanStr(productRow.provinceName),
    shop_name: cleanStr(productRow.shopName),
    price,
    stock_status: buildStockStatus(productRow.stock),
    part_number: partNumber,
    part_number_norm: partNumber ? normalizePartNumber(partNumber) : null,
    product_name: productName,
    search_keywords: searchKeywords,
    search_text: searchText,
    popularity_score: popularityScore,
    search_score: searchPriority,
    primary_brand_name: primaryBrand,
    primary_model_name: primaryModel,
    primary_year_from: primaryYearFrom,
    primary_year_to: primaryYearTo,
    status: opts.publiclyVisible ? "active" : "inactive",
  };
}

/**
 * @param {object} productRow
 * @param {object[]} fitmentRows
 * @param {{ publiclyVisible: boolean }} opts
 * @returns {SearchIndexDocument[]}
 */
export function buildSearchIndexDocumentsForProduct(productRow, fitmentRows, opts) {
  const primaryFitment = fitmentRows.length
    ? pickPrimaryFitment(
        fitmentRows.map((f) => ({
          hang_xe: f.hang_xe,
          ten_xe: f.ten_xe,
          year_from: f.year_from,
          year_to: f.year_to,
          is_primary: f.is_primary,
        })),
      )
    : null;
  const docOpts = { ...opts, primaryFitment };
  if (!fitmentRows.length) {
    return [buildSearchIndexDocument(productRow, null, docOpts)];
  }
  return fitmentRows.map((fitment) => buildSearchIndexDocument(productRow, fitment, docOpts));
}

/**
 * Normalize optional year for unique key (NULL → 0 sentinel in DB layer).
 * @param {number | null | undefined} year
 */
export function normalizeYearKey(year) {
  if (year == null || !Number.isFinite(Number(year))) return 0;
  const y = Number(year);
  return y > 0 ? y : 0;
}

/**
 * @param {number | null | undefined} modelId
 */
export function normalizeModelKey(modelId) {
  if (modelId == null || !Number.isFinite(Number(modelId))) return 0;
  const m = Number(modelId);
  return m > 0 ? m : 0;
}

/**
 * Popup-ready field names mapped from index row (for validation / future runtime).
 * @param {SearchIndexDocument} doc
 */
export function documentPopupFields(doc) {
  return {
    product_id: doc.product_id,
    title: doc.title,
    canonical_slug: doc.canonical_path?.replace(/^\//, "").replace(/-\d+$/, "") || null,
    canonical_url: doc.canonical_url,
    thumbnail_url: doc.thumbnail_url,
    brand: doc.brand_name,
    brand_slug: doc.brand_slug,
    model: doc.model_name,
    model_slug: doc.model_slug,
    vehicle_label: doc.vehicle_label,
    category_id: doc.category_id,
    category_name: doc.category_name,
    category_slug: doc.category_slug,
    province_name: doc.location_name,
    shop_name: doc.shop_name,
    price: doc.price,
    stock_status: doc.stock_status,
    part_number: doc.part_number,
    part_number_norm: doc.part_number_norm,
  };
}
