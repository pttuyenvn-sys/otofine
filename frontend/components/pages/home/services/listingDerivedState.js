// Pure derived-state helpers for Home.jsx
// Keep behavior identical to Home.jsx originals.
const listingHelpers = require("./listingUrlState.js");
const { slugify, rowName, normalizeLocationDisplayName } = listingHelpers;

function computeDbCategoryName(categories = [], category) {
  const row = resolveCategoryCatalogRow(categories, category);
  return row ? rowName(row) : category;
}

function resolveCategoryCatalogRow(categories = [], category = "") {
  const categorySlug = slugify(category);
  if (!categorySlug) return null;

  return (
    (categories || []).find((row) => {
      const name = rowName(row);
      const slugs = [name, row?.canonical_slug, row?.category_slug, row?.slug]
        .map(slugify)
        .filter(Boolean);
      const normalized = categorySlug.replace(/-o-to$/, "");
      return slugs.some(
        (value) =>
          value === categorySlug ||
          value.replace(/-o-to$/, "") === normalized,
      );
    }) || null
  );
}

function resolveCategoryCanonicalSlug(categories = [], category = "") {
  const row = resolveCategoryCatalogRow(categories, category);
  return String(row?.canonical_slug || row?.category_slug || "")
    .trim()
    .toLowerCase();
}

function computeDbLocationName(availableLocations = [], location) {
  const locationSlug = slugify(location);
  if (!locationSlug) return "";

  const match = (availableLocations || []).find((row) => {
    const dbName = String(row?.name || "").trim();
    const normalizedName = normalizeLocationDisplayName(dbName);
    const slugs = [dbName, normalizedName, row?.slug].map(slugify).filter(Boolean);
    return slugs.includes(locationSlug);
  });

  if (match?.name) {
    const dbName = String(match.name).trim();
    if (String(location || "").toLowerCase().startsWith("tp ")) return dbName;
    if (String(location || "").toLowerCase().startsWith("tp-")) return dbName;
    return normalizeLocationDisplayName(dbName);
  }
  return location;
}

function buildUrlState({ category, brand, model, year, location }) {
  return { category, brand, model, year, location };
}

function computePopularCategories(menuCategories = []) {
  return [...menuCategories]
    .sort((a, b) => (b.total_product_count || 0) - (a.total_product_count || 0))
    .slice(0, 20);
}

function computePopularQuickKeywords(hotKeywords = [], recentSearches = []) {
  const fixedFour = hotKeywords.slice(0, 4);
  const seen = new Set(fixedFour);
  const fromRecent = [];
  for (const raw of recentSearches) {
    const t = (raw || "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    fromRecent.push(t);
    if (fromRecent.length >= 4) break;
  }
  return [...fixedFour, ...fromRecent];
}

module.exports = {
  computeDbCategoryName,
  resolveCategoryCatalogRow,
  resolveCategoryCanonicalSlug,
  computeDbLocationName,
  buildUrlState,
  computePopularCategories,
  computePopularQuickKeywords,
};

