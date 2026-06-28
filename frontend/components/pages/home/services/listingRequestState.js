// Pure request/query param derivation helpers for Home.jsx
const listingHelpers = require("./listingUrlState.js");
const { cleanQueryValue } = listingHelpers;
const { deriveSelectedYear } = require("./yearState.js");

/**
 * Grid/facet/suggest fitment year (ARCH-MP-03B.9).
 * SSOT: URL `year` — single token only; ranges omit query year.
 *
 * @param {{ year?: string | null }} input
 * @returns {string}
 */
function resolveListingQueryYear({ year = "" } = {}) {
  const fitmentYear = deriveSelectedYear(year);
  if (fitmentYear == null || fitmentYear === "") return "";
  return String(fitmentYear);
}

function buildProductListParams({
  category,
  brand,
  model,
  year,
  location,
  keyword,
  page,
  sort,
}) {
  const params = new URLSearchParams();
  const c = cleanQueryValue(category);
  const b = cleanQueryValue(brand);
  const m = cleanQueryValue(model);
  const y = resolveListingQueryYear({ year });
  const l = cleanQueryValue(location);
  const k = cleanQueryValue(keyword);
  const p = cleanQueryValue(page);
  const s = cleanQueryValue(sort) || "popular";
  if (c) params.append("category", c);
  if (b) params.append("brand", b);
  if (m) params.append("model", m);
  if (y) params.append("year", y);
  if (l) params.append("location", l);
  if (k) params.append("keyword", k);
  if (p) params.append("page", String(p));
  if (s) params.append("sort", s);
  return params.toString();
}

function buildFilterCategoriesParams({
  brand,
  model,
  year,
  location,
  keyword,
}) {
  const params = new URLSearchParams();
  const b = cleanQueryValue(brand);
  const m = cleanQueryValue(model);
  const y = resolveListingQueryYear({ year });
  const l = cleanQueryValue(location);
  const k = cleanQueryValue(keyword);
  if (b) params.append("brand", b);
  if (m) params.append("model", m);
  if (y) params.append("year", y);
  if (l) params.append("location", l);
  if (k) params.append("keyword", k);
  return params.toString();
}

function buildLocationsParams({
  category,
  brand,
  model,
  year,
  keyword,
}) {
  const params = new URLSearchParams();
  const c = cleanQueryValue(category);
  const b = cleanQueryValue(brand);
  const m = cleanQueryValue(model);
  const y = resolveListingQueryYear({ year });
  const k = cleanQueryValue(keyword);
  if (c) params.append("category", c);
  if (b) params.append("brand", b);
  if (m) params.append("model", m);
  if (y) params.append("year", y);
  if (k) params.append("keyword", k);
  return params.toString();
}

function buildSuggestParams({
  q,
  brand,
  model,
  year,
  page = 1,
  limit = 100,
}) {
  const params = new URLSearchParams();
  const y = resolveListingQueryYear({ year });
  if (q) params.append("q", q);
  params.append("page", String(page));
  params.append("limit", String(limit));
  if (brand) params.append("brand", brand);
  if (model) params.append("model", model);
  if (y) params.append("year", y);
  return params.toString();
}

/** Category sidebar suggest — preserves year ranges for vehicle-scoped counts. */
function buildCategorySidebarSuggestParams({
  q,
  brand,
  model,
  year,
  page = 1,
  limit = 100,
}) {
  const params = new URLSearchParams();
  const y = cleanQueryValue(year);
  if (q) params.append("q", q);
  params.append("page", String(page));
  params.append("limit", String(limit));
  if (brand) params.append("brand", brand);
  if (model) params.append("model", model);
  if (y) params.append("year", y);
  return params.toString();
}

/** Product preview when top category suggestion drives intent (listing API, no keyword). */
function buildSuggestCategoryProductPreviewParams({
  category,
  brand,
  model,
  year,
  page = 1,
  sort = "popular",
}) {
  const params = new URLSearchParams();
  const c = cleanQueryValue(category);
  const b = cleanQueryValue(brand);
  const m = cleanQueryValue(model);
  const y = cleanQueryValue(year);
  const p = cleanQueryValue(page);
  const s = cleanQueryValue(sort) || "popular";
  if (c) params.append("category", c);
  if (b) params.append("brand", b);
  if (m) params.append("model", m);
  if (y) params.append("year", y);
  if (p) params.append("page", String(p));
  if (s) params.append("sort", s);
  return params.toString();
}

/** Grouped vehicle search popup batch preview. */
function buildSearchPreviewBatchParams({
  q,
  brand,
  model,
  year,
  groupLimit = 3,
  productsPerGroup = 2,
}) {
  const params = new URLSearchParams();
  const y = cleanQueryValue(year);
  if (q) params.append("q", q);
  if (brand) params.append("brand", brand);
  if (model) params.append("model", model);
  if (y) params.append("year", y);
  params.append("groupLimit", String(groupLimit));
  params.append("productsPerGroup", String(productsPerGroup));
  return params.toString();
}

module.exports = {
  resolveListingQueryYear,
  buildProductListParams,
  buildFilterCategoriesParams,
  buildLocationsParams,
  buildSuggestParams,
  buildCategorySidebarSuggestParams,
  buildSuggestCategoryProductPreviewParams,
  buildSearchPreviewBatchParams,
};
