// Category search suggest — vehicle-scoped labels and SEO landing paths.
const { buildListingUrlFromIdentity } = require("./listingUrlState.js");
const { cleanQueryValue } = require("./listingUrlState.js");

function foldVi(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function tokenBoundaryMatch(textFold, token) {
  if (!token) return false;
  if (textFold === token) return true;
  if (textFold.startsWith(`${token} `)) return true;
  if (textFold.endsWith(` ${token}`)) return true;
  return textFold.includes(` ${token} `);
}

function extractModelFromCategoryName(categoryName, brand, modelRows = []) {
  const catFold = foldVi(categoryName);
  const brandFold = foldVi(brand);
  if (!catFold) return "";

  const candidates = modelRows
    .map((row) => ({
      brand: String(row?.brand || brand || "").trim(),
      model: String(row?.model || row?.ten_xe || row?.name || "").trim(),
    }))
    .filter((row) => row.model)
    .filter((row) => !brandFold || foldVi(row.brand) === brandFold)
    .sort((a, b) => b.model.length - a.model.length);

  for (const row of candidates) {
    if (tokenBoundaryMatch(catFold, foldVi(row.model))) return row.model;
  }
  return "";
}

function categoryNameIncludesVehicleToken(categoryName, brand = "", model = "") {
  const catFold = foldVi(categoryName);
  if (model && tokenBoundaryMatch(catFold, foldVi(model))) return true;
  if (brand && tokenBoundaryMatch(catFold, foldVi(brand))) return true;
  return false;
}

/**
 * @typedef {{ brand?: string, model?: string, year?: string, location?: string, modelRows?: object[] }} VehicleSuggestContext
 */

/**
 * @param {VehicleSuggestContext} ctx
 * @returns {VehicleSuggestContext}
 */
function normalizeVehicleSuggestContext(ctx = {}) {
  return {
    brand: cleanQueryValue(ctx.brand) || "",
    model: cleanQueryValue(ctx.model) || "",
    year: cleanQueryValue(ctx.year) || "",
    location: cleanQueryValue(ctx.location) || "",
  };
}

function resolveCategoryVehicleContext(categoryName, vehicleCtx = {}) {
  const { brand, model, year, location, modelRows = [] } = {
    ...normalizeVehicleSuggestContext(vehicleCtx),
    modelRows: vehicleCtx.modelRows || [],
  };

  if (model) {
    return { brand, model, year, location };
  }

  if (brand) {
    const extracted = extractModelFromCategoryName(categoryName, brand, modelRows);
    return { brand, model: extracted || "", year, location };
  }

  return { brand, model, year, location };
}

/**
 * Human label for category suggest rows, e.g. "Càng A Phải Toyota Vios 2014-2020".
 *
 * @param {string} categoryName
 * @param {VehicleSuggestContext} vehicleCtx
 */
function formatCategorySuggestLabel(categoryName, vehicleCtx = {}) {
  const name = String(categoryName || "").trim();
  const resolved = resolveCategoryVehicleContext(name, vehicleCtx);
  const parts = [name];
  if (resolved.brand && !categoryNameIncludesVehicleToken(name, resolved.brand, "")) {
    parts.push(resolved.brand);
  }
  if (resolved.model && !categoryNameIncludesVehicleToken(name, "", resolved.model)) {
    parts.push(resolved.model);
  }
  if (resolved.year && !name.includes(resolved.year)) {
    parts.push(resolved.year);
  }
  return parts.filter(Boolean).join(" ");
}

/**
 * Most specific SEO landing path for a category suggestion under current vehicle context.
 * Priority: category+brand+model+year → category+brand+model → category+brand → category.
 *
 * @param {{ canonical_name?: string, canonical_slug?: string }} item
 * @param {VehicleSuggestContext} vehicleCtx
 * @returns {string}
 */
function buildCategorySuggestHref(item, vehicleCtx = {}) {
  const categoryName = String(item?.canonical_name || "").trim();
  const canonicalSlug = String(item?.canonical_slug || "").trim().toLowerCase();
  const resolved = resolveCategoryVehicleContext(categoryName, vehicleCtx);
  const { brand, model, year, location } = resolved;

  if (!categoryName) return "/";

  return buildListingUrlFromIdentity({
    categoryName,
    hasCategory: true,
    brand,
    model,
    year,
    location,
    canonicalSlug,
  });
}

/**
 * Listing state patch + href for category suggestion navigation.
 *
 * @param {{ canonical_name?: string, canonical_slug?: string }} item
 * @param {VehicleSuggestContext} vehicleCtx
 */
function buildCategorySuggestNavigation(item, vehicleCtx = {}) {
  const categoryName = String(item?.canonical_name || "").trim();
  const resolved = resolveCategoryVehicleContext(categoryName, vehicleCtx);
  const { brand, model, year, location } = resolved;
  const href = buildCategorySuggestHref(item, { ...vehicleCtx, ...resolved });

  return {
    href,
    state: {
      category: categoryName,
      brand,
      model,
      year,
      location,
    },
  };
}

module.exports = {
  normalizeVehicleSuggestContext,
  formatCategorySuggestLabel,
  buildCategorySuggestHref,
  buildCategorySuggestNavigation,
};
