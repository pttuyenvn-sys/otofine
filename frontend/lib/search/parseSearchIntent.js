/**
 * SEARCH-INTENT-PARSER-01 — parse raw search query into structured listing intent.
 * Uses existing platform dictionaries only (brands, modelRows, categories).
 */

import listingUrlState from "../../components/pages/home/services/listingUrlState.js";

const { slugify, rowName, KNOWN_VEHICLE_BRANDS } = listingUrlState;

/** Shorthand tokens → catalog brand/model. */
const MODEL_TOKEN_ALIASES = Object.freeze({
  cx5: { brand: "Mazda", model: "CX-5" },
  "cx-5": { brand: "Mazda", model: "CX-5" },
  altis: { brand: "Toyota", model: "Altis" },
  morning: { brand: "Kia", model: "Morning" },
  vf5: { brand: "VinFast", model: "VF5" },
  "vf-5": { brand: "VinFast", model: "VF5" },
  vios: { brand: "Toyota", model: "Vios" },
  camry: { brand: "Toyota", model: "Camry" },
  innova: { brand: "Toyota", model: "Innova" },
});

function foldVi(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function displayFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

function isPartNumberToken(value) {
  const raw = String(value || "").trim();
  if (raw.length < 5) return false;
  if (!/(?=.*\d)/.test(raw)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(raw);
}

function buildBrandCandidates(brands = []) {
  const rows = [];
  const push = (name) => {
    const n = String(name || "").trim();
    if (!n) return;
    const slug = slugify(n);
    if (!slug) return;
    rows.push({ name: n, slug });
  };

  for (const row of brands) {
    push(row?.brand || row?.hang_xe || row?.name || row);
  }
  for (const known of KNOWN_VEHICLE_BRANDS) {
    push(displayFromSlug(known));
  }

  const seen = new Set();
  return rows
    .filter((row) => {
      if (seen.has(row.slug)) return false;
      seen.add(row.slug);
      return true;
    })
    .sort((a, b) => b.slug.length - a.slug.length);
}

function buildModelCandidates(modelRows = [], brandFilter = "") {
  const brandFold = foldVi(brandFilter);
  return modelRows
    .map((row) => {
      const brand = String(row?.brand || "").trim();
      const model = String(row?.model || row?.ten_xe || "").trim();
      const slug = slugify(model);
      return { brand, model, slug };
    })
    .filter((row) => row.model && row.slug)
    .filter((row) => !brandFold || foldVi(row.brand) === brandFold)
    .sort((a, b) => b.slug.length - a.slug.length);
}

function removeBrandTokens(tokens, brand, brands) {
  if (!brand || !tokens.length) return tokens;
  const brandFold = foldVi(brand);
  const brandSlug = foldVi(slugify(brand));
  const candidates = buildBrandCandidates(brands);
  const matchSlugs = new Set([brandSlug, brandFold]);
  for (const row of candidates) {
    if (foldVi(row.name) === brandFold) {
      matchSlugs.add(foldVi(row.slug));
    }
  }

  const next = [...tokens];
  for (let len = Math.min(3, next.length); len >= 1; len -= 1) {
    for (let i = 0; i <= next.length - len; i += 1) {
      const span = next.slice(i, i + len);
      const joined = foldVi(span.join("-"));
      const spaced = foldVi(span.join(" "));
      if (matchSlugs.has(joined) || matchSlugs.has(spaced)) {
        return [...next.slice(0, i), ...next.slice(i + len)];
      }
    }
  }
  return next;
}

function consumeBrand(tokens, brands) {
  const candidates = buildBrandCandidates(brands);
  for (let len = Math.min(3, tokens.length); len >= 1; len -= 1) {
    for (let i = 0; i <= tokens.length - len; i += 1) {
      const span = tokens.slice(i, i + len);
      const joined = foldVi(span.join("-"));
      const hit = candidates.find(
        (c) =>
          foldVi(c.slug) === joined || foldVi(c.slug) === foldVi(span.join(" ")),
      );
      if (hit) {
        return {
          brand: hit.name,
          nextTokens: [...tokens.slice(0, i), ...tokens.slice(i + len)],
        };
      }
    }
  }
  return { brand: "", nextTokens: tokens };
}

function consumeModel(tokens, brand, modelRows) {
  const candidates = buildModelCandidates(modelRows, brand);
  for (let len = Math.min(4, tokens.length); len >= 1; len -= 1) {
    for (let i = 0; i <= tokens.length - len; i += 1) {
      const span = tokens.slice(i, i + len);
      const joined = foldVi(span.join("-"));
      const hit = candidates.find(
        (c) =>
          foldVi(c.slug) === joined ||
          foldVi(c.model) === foldVi(span.join(" ")),
      );
      if (hit) {
        return {
          brand: brand || hit.brand,
          model: hit.model,
          nextTokens: [...tokens.slice(0, i), ...tokens.slice(i + len)],
        };
      }
    }
  }
  return { brand, model: "", nextTokens: tokens };
}

function consumeModelAlias(tokens, brand, model) {
  const next = [...tokens];
  for (let i = 0; i < next.length; i += 1) {
    const key = foldVi(next[i]);
    const alias = MODEL_TOKEN_ALIASES[key];
    if (!alias) continue;
    if (brand && foldVi(alias.brand) !== foldVi(brand)) continue;
    return {
      brand: brand || alias.brand,
      model: model || alias.model,
      nextTokens: [...next.slice(0, i), ...next.slice(i + 1)],
    };
  }
  return { brand, model, nextTokens: next };
}

function matchCategoryInText(text, categories = []) {
  const folded = foldVi(text);
  if (!folded) return "";

  const rows = categories
    .map((row) => {
      const name = rowName(row);
      return { name, folded: foldVi(name) };
    })
    .filter((row) => row.name && row.folded.length >= 3)
    .sort((a, b) => b.folded.length - a.folded.length);

  for (const row of rows) {
    if (folded.includes(row.folded)) {
      return row.name;
    }
  }
  return "";
}

function removeCategoryPhrase(text, categoryName) {
  if (!categoryName) return text;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const catWords = String(categoryName).split(/\s+/).filter(Boolean);
  if (!catWords.length) return text;

  const catFolded = catWords.map(foldVi);
  for (let i = 0; i <= words.length - catWords.length; i += 1) {
    const slice = words.slice(i, i + catWords.length).map(foldVi);
    if (slice.every((w, idx) => w === catFolded[idx])) {
      return [...words.slice(0, i), ...words.slice(i + catWords.length)]
        .join(" ")
        .trim();
    }
  }
  return text;
}

/**
 * @param {string} rawQuery
 * @param {{ brands?: object[], modelRows?: object[], categories?: object[] }} dictionaries
 */
export function parseSearchIntent(rawQuery, dictionaries = {}) {
  const empty = {
    category: "",
    brand: "",
    model: "",
    year: "",
    partNumber: "",
    remainingKeywords: "",
    queryBrand: "",
    queryModel: "",
    queryYear: "",
  };

  const raw = String(rawQuery || "").trim();
  if (!raw) return empty;

  if (isPartNumberToken(raw)) {
    return { ...empty, partNumber: raw };
  }

  const { brands = [], modelRows = [], categories = [] } = dictionaries;

  let working = raw;
  let year = "";
  const yearMatch = working.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    year = yearMatch[0];
    working = working.replace(yearMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  let tokens = working.split(/\s+/).filter(Boolean);
  let partNumber = "";

  for (let i = 0; i < tokens.length; i += 1) {
    if (isPartNumberToken(tokens[i])) {
      partNumber = tokens[i];
      tokens = [...tokens.slice(0, i), ...tokens.slice(i + 1)];
      break;
    }
  }

  let brand = "";
  let model = "";

  const aliasFirst = consumeModelAlias(tokens, brand, model);
  brand = aliasFirst.brand;
  model = aliasFirst.model;
  tokens = aliasFirst.nextTokens;

  if (!brand) {
    const brandHit = consumeBrand(tokens, brands);
    brand = brandHit.brand;
    tokens = brandHit.nextTokens;
  }

  const modelHit = consumeModel(tokens, brand, modelRows);
  brand = modelHit.brand || brand;
  model = modelHit.model || model;
  tokens = modelHit.nextTokens;

  if (!model) {
    const aliasAfter = consumeModelAlias(tokens, brand, model);
    brand = aliasAfter.brand || brand;
    model = aliasAfter.model || model;
    tokens = aliasAfter.nextTokens;
  }

  if (!brand && model) {
    const owner = modelRows.find(
      (row) => foldVi(row?.model || row?.ten_xe) === foldVi(model),
    );
    if (owner?.brand) brand = String(owner.brand).trim();
  }

  if (brand) {
    tokens = removeBrandTokens(tokens, brand, brands);
  }

  let remaining = tokens.join(" ").trim();
  let category = matchCategoryInText(remaining || working, categories);
  if (category) {
    remaining = removeCategoryPhrase(remaining, category).trim();
  }

  return {
    category,
    brand,
    model,
    year,
    partNumber,
    remainingKeywords: remaining,
    queryBrand: brand,
    queryModel: model,
    queryYear: year,
  };
}

/**
 * SEARCH-QUERY-SCOPE-AND-PREVIEW-01 — query overrides page context.
 *
 * Rule A: query model → use query brand/model; year only if query specifies
 * Rule B: query brand, no model → brand from query, model ALL, clear page model/year
 * Rule C: category/keywords only → inherit page brand/model/year
 * Rule D: query year → overrides page year; with brand-only query, model ALL
 *
 * @param {object} intent from parseSearchIntent
 * @param {{ category?: string, brand?: string, model?: string, year?: string, location?: string }} listingState
 */
export function resolveSearchScope(intent, listingState = {}) {
  const parsed = intent || {};
  const page = listingState || {};

  if (parsed.partNumber) {
    return {
      category: parsed.category || page.category || "",
      brand: page.brand || "",
      model: page.model || "",
      year: page.year || "",
      partNumber: parsed.partNumber,
      remainingKeywords: "",
      location: page.location || "",
      modelAll: false,
    };
  }

  const queryBrand = String(parsed.queryBrand ?? parsed.brand ?? "").trim();
  const queryModel = String(parsed.queryModel ?? parsed.model ?? "").trim();
  const queryYear = String(parsed.queryYear ?? parsed.year ?? "").trim();
  const hasQueryModel = Boolean(queryModel);
  const hasQueryBrand = Boolean(queryBrand);
  const hasQueryYear = Boolean(queryYear);

  let brand = page.brand || "";
  let model = page.model || "";
  let year = page.year || "";

  if (hasQueryModel) {
    brand = queryBrand || page.brand || "";
    model = queryModel;
    year = hasQueryYear ? queryYear : "";
  } else if (hasQueryBrand) {
    brand = queryBrand;
    model = "";
    year = hasQueryYear ? queryYear : "";
  } else if (hasQueryYear) {
    year = queryYear;
  }

  return {
    category: parsed.category || page.category || "",
    brand,
    model,
    year,
    partNumber: "",
    remainingKeywords: parsed.remainingKeywords || "",
    location: page.location || "",
    modelAll: !model && Boolean(brand),
  };
}

/**
 * @deprecated use resolveSearchScope — kept for imports
 */
export function mergeSearchIntentWithListingState(intent, listingState = {}) {
  return resolveSearchScope(intent, listingState);
}

export function resolveSearchApiKeyword(state, rawQuery = "") {
  if (state?.partNumber) return state.partNumber;
  if (state?.remainingKeywords) return state.remainingKeywords;
  return String(rawQuery || "").trim();
}

function tokenBoundaryMatch(textFold, token) {
  if (!token) return false;
  if (textFold === token) return true;
  if (textFold.startsWith(`${token} `)) return true;
  if (textFold.endsWith(` ${token}`)) return true;
  return textFold.includes(` ${token} `);
}

/**
 * Extract model token embedded in canonical category name (model-all searches).
 * @param {string} categoryName
 * @param {string} brand
 * @param {object[]} modelRows
 */
export function extractModelFromCategoryName(categoryName, brand, modelRows = []) {
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
    const modelFold = foldVi(row.model);
    if (tokenBoundaryMatch(catFold, modelFold)) return row.model;
  }
  return "";
}

export function categoryNameIncludesVehicleToken(categoryName, brand = "", model = "") {
  const catFold = foldVi(categoryName);
  if (model && tokenBoundaryMatch(catFold, foldVi(model))) return true;
  if (brand && tokenBoundaryMatch(catFold, foldVi(brand))) return true;
  return false;
}

/** OEM / part-number token — search immediately even when length < 2. */
export function isOemPartNumberQuery(value) {
  return isPartNumberToken(value);
}

/**
 * @param {string} rawQuery
 * @param {{ brands?: object[], modelRows?: object[], categories?: object[] }} [dictionaries]
 */
export function shouldFetchSearchSuggest(rawQuery, dictionaries = {}) {
  const q = String(rawQuery || "").trim();
  if (!q) return false;
  if (q.length >= 2) return true;
  if (isPartNumberToken(q)) return true;
  const intent = parseSearchIntent(q, dictionaries);
  return Boolean(intent.partNumber);
}
