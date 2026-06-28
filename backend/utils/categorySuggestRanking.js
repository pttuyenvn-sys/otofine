import { foldVi, normalizeSearchText } from "./keywordRelevanceRanking.js";

/** Model shorthand tokens stripped from category phrase (aligned with frontend intent parser). */
const MODEL_STOP_TOKENS = new Set([
  "vios",
  "cx5",
  "cx-5",
  "altis",
  "morning",
  "vf5",
  "vf-5",
  "camry",
  "innova",
  "fortuner",
  "ranger",
  "everest",
]);

const BRAND_STOP_TOKENS = new Set([
  "toyota",
  "kia",
  "mazda",
  "honda",
  "hyundai",
  "ford",
  "mitsubishi",
  "nissan",
  "suzuki",
  "chevrolet",
  "isuzu",
  "vinfast",
]);

function isYearToken(token) {
  return /^(19|20)\d{2}$/.test(String(token || ""));
}

/**
 * Strip vehicle tokens from raw keyword so category ranking uses part intent only.
 * @param {string} keyword
 * @param {{ brand?: string, model?: string }} vehicle
 */
export function extractCategoryPhraseFromKeyword(
  keyword,
  { brand = "", model = "" } = {},
) {
  const raw = String(keyword || "").trim();
  if (!raw) return "";

  const brandFold = foldVi(brand);
  const modelFold = foldVi(model);
  const modelSlug = modelFold.replace(/\s+/g, "");

  const tokens = raw.split(/\s+/).filter(Boolean);
  const kept = tokens.filter((token) => {
    if (isYearToken(token)) return false;
    const f = foldVi(token);
    const compact = f.replace(/-/g, "");
    if (brandFold && f === brandFold) return false;
    if (modelFold && (f === modelFold || compact === modelSlug)) return false;
    if (!brandFold && BRAND_STOP_TOKENS.has(f)) return false;
    if (!modelFold && MODEL_STOP_TOKENS.has(f)) return false;
    if (!modelFold && MODEL_STOP_TOKENS.has(compact)) return false;
    return true;
  });

  return (kept.length ? kept.join(" ") : raw).trim();
}

function tokenBoundaryMatch(textFold, token) {
  if (!token) return false;
  if (textFold === token) return true;
  if (textFold.startsWith(`${token} `)) return true;
  if (textFold.endsWith(` ${token}`)) return true;
  return textFold.includes(` ${token} `);
}

/**
 * Category phrase relevance (lower = better).
 * 1 exact phrase, 2 exact normalized, 3 prefix, 4 all tokens, 9 weak/none.
 */
export function scoreCategoryPhraseTier(categoryName, phrase) {
  const catRaw = String(categoryName || "").trim();
  const qRaw = String(phrase || "").trim();
  if (!catRaw || !qRaw) return 9;

  const catLower = catRaw.toLowerCase();
  const qLower = qRaw.toLowerCase();
  if (catLower === qLower) return 1;

  const catFold = foldVi(catRaw);
  const qFold = foldVi(qRaw);
  const catNorm = normalizeSearchText(catRaw);
  const qNorm = normalizeSearchText(qRaw);

  if (catFold === qFold || catNorm === qNorm) return 2;

  if (
    catFold.startsWith(qFold) ||
    catNorm.startsWith(qNorm) ||
    qFold.startsWith(catFold)
  ) {
    return 3;
  }

  const qTokens = qFold.split(/\s+/).filter(Boolean);
  if (
    qTokens.length > 0 &&
    qTokens.every((token) => tokenBoundaryMatch(catFold, token))
  ) {
    return 4;
  }

  return 9;
}

/**
 * Vehicle mention in canonical category label (lower = better). Tier 5 in overall sort.
 */
export function scoreCategoryVehicleTier(categoryName, { brand = "", model = "" } = {}) {
  const catFold = foldVi(categoryName);
  const brandFold = foldVi(brand);
  const modelFold = foldVi(model);
  if (!catFold || (!brandFold && !modelFold)) return 9;

  const hasBrand = brandFold ? tokenBoundaryMatch(catFold, brandFold) : false;
  const hasModel = modelFold ? tokenBoundaryMatch(catFold, modelFold) : false;

  if (hasBrand && hasModel) return 1;
  if (hasModel) return 2;
  if (hasBrand) return 3;
  return 9;
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

function buildModelGroupScores(rows, brand, modelRows = []) {
  const scores = new Map();
  for (const row of rows || []) {
    const model = extractModelFromCategoryName(row.canonical_name, brand, modelRows);
    if (!model) continue;
    const count = Number(row.total_count) || 0;
    scores.set(model, Math.max(scores.get(model) || 0, count));
  }
  return scores;
}

/**
 * SEARCH-RANKING-EXACT-CATEGORY-BOOST-01 — sort sidebar category suggestions.
 * @param {Array<{ canonical_name: string, canonical_slug?: string, total_count?: number, search_priority?: number }>} rows
 * @param {{ keyword: string, brand?: string, model?: string, modelAll?: boolean, modelRows?: object[] }} context
 */
export function rankCategorySidebarSuggestions(rows, context = {}) {
  const phrase = extractCategoryPhraseFromKeyword(context.keyword, {
    brand: context.brand,
    model: context.model,
  });
  const vehicle = { brand: context.brand, model: context.model };
  const modelAll = Boolean(context.modelAll);
  const modelRows = context.modelRows || [];
  const modelGroupScores = modelAll
    ? buildModelGroupScores(rows, context.brand, modelRows)
    : null;

  return [...(rows || [])].sort((a, b) => {
    const aPhrase = scoreCategoryPhraseTier(a.canonical_name, phrase);
    const bPhrase = scoreCategoryPhraseTier(b.canonical_name, phrase);
    if (aPhrase !== bPhrase) return aPhrase - bPhrase;

    if (modelAll && modelGroupScores) {
      const aModel = extractModelFromCategoryName(a.canonical_name, context.brand, modelRows);
      const bModel = extractModelFromCategoryName(b.canonical_name, context.brand, modelRows);
      const aGroup = modelGroupScores.get(aModel) || 0;
      const bGroup = modelGroupScores.get(bModel) || 0;
      if (aGroup !== bGroup) return bGroup - aGroup;
      if (aModel !== bModel) return aModel.localeCompare(bModel, "vi");
    }

    const aVehicle = scoreCategoryVehicleTier(a.canonical_name, vehicle);
    const bVehicle = scoreCategoryVehicleTier(b.canonical_name, vehicle);
    if (aVehicle !== bVehicle) return aVehicle - bVehicle;

    const aCount = Number(a.total_count) || 0;
    const bCount = Number(b.total_count) || 0;
    if (aCount !== bCount) return bCount - aCount;

    const aPop = Number(a.search_priority) || 0;
    const bPop = Number(b.search_priority) || 0;
    if (aPop !== bPop) return bPop - aPop;

    const aLen = String(a.canonical_name || "").length;
    const bLen = String(b.canonical_name || "").length;
    if (aLen !== bLen) return aLen - bLen;

    return String(a.canonical_name || "").localeCompare(
      String(b.canonical_name || ""),
      "vi",
    );
  });
}

/**
 * Rank category+vehicle preview groups (SEARCH-GROUPED-VEHICLE-POPUP-01).
 * @param {Array<{ canonical_name: string, brand?: string, model?: string, total_count?: number, search_priority?: number }>} rows
 * @param {{ keyword: string, brand?: string, model?: string }} context
 */
export function rankSearchPreviewGroups(rows, context = {}) {
  const phrase = extractCategoryPhraseFromKeyword(context.keyword, {
    brand: context.brand,
    model: context.model,
  });

  return [...(rows || [])].sort((a, b) => {
    const aPhrase = scoreCategoryPhraseTier(a.canonical_name, phrase);
    const bPhrase = scoreCategoryPhraseTier(b.canonical_name, phrase);
    if (aPhrase !== bPhrase) return aPhrase - bPhrase;

    const aVehicle = scoreCategoryVehicleTier(a.canonical_name, {
      brand: a.brand || context.brand,
      model: a.model || context.model,
    });
    const bVehicle = scoreCategoryVehicleTier(b.canonical_name, {
      brand: b.brand || context.brand,
      model: b.model || context.model,
    });
    if (aVehicle !== bVehicle) return aVehicle - bVehicle;

    const aCount = Number(a.total_count) || 0;
    const bCount = Number(b.total_count) || 0;
    if (aCount !== bCount) return bCount - aCount;

    const aPop = Number(a.search_priority) || 0;
    const bPop = Number(b.search_priority) || 0;
    if (aPop !== bPop) return bPop - aPop;

    const aModel = String(a.model || "");
    const bModel = String(b.model || "");
    if (aModel !== bModel) return aModel.localeCompare(bModel, "vi");

    return String(a.canonical_name || "").localeCompare(
      String(b.canonical_name || ""),
      "vi",
    );
  });
}
