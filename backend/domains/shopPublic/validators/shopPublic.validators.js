import { normalizeSlugParam, isValidShopSlug } from "../utils/slug.util.js";
import { publicShopConfig } from "../config/publicShop.config.js";

/**
 * Validate the :slug URL param. Returns the normalized slug or null.
 */
export function validateShopSlugParam(rawSlug) {
  const slug = normalizeSlugParam(rawSlug);
  if (!isValidShopSlug(slug)) return null;
  return slug;
}

/**
 * Validate the products list query params. Whitelist-only — anything
 * else is dropped silently to keep the API surface stable.
 */
export function validateProductsQuery(q = {}) {
  const out = {};
  if (typeof q.q === "string" && q.q.trim()) out.q = q.q.trim().slice(0, 80);
  if (typeof q.category === "string" && q.category.trim()) {
    // `c-123` keeps its case for the repo regex; canonical_name slugs
    // are matched case-insensitively SQL-side. Slice prevents abuse.
    out.category = q.category.trim().slice(0, 80);
  }
  if (typeof q.brand === "string" && q.brand.trim()) {
    out.brand = q.brand.trim().slice(0, 80);
  }
  if (typeof q.model === "string" && q.model.trim()) {
    out.model = q.model.trim().slice(0, 80);
  }
  if (q.year !== undefined && q.year !== null && String(q.year).trim() !== "") {
    const yN = Number(q.year);
    if (Number.isFinite(yN) && yN >= 1900 && yN <= 2100) {
      out.year = Math.floor(yN);
    }
  }
  if (typeof q.sort === "string") {
    const s = q.sort.toLowerCase();
    if (s === "newest" || s === "price_asc" || s === "price_desc") {
      out.sort = s;
    }
  }
  const page = Number(q.page);
  if (Number.isFinite(page) && page > 0 && page <= 500) {
    out.page = Math.floor(page);
  } else {
    out.page = 1;
  }
  const perPage = Number(q.perPage);
  if (Number.isFinite(perPage) && perPage > 0 && perPage <= 60) {
    out.perPage = Math.floor(perPage);
  } else {
    out.perPage = publicShopConfig.listPageSize;
  }
  return out;
}
