import { cache } from "react";
import { parseVehicleYearSuffix } from "@/lib/seo/parseVehicleYearSuffix";
import { getProductDetailCached } from "@/lib/product/getProductDetailCached";
import { getVehicleSeoPage } from "@/lib/seo/getVehicleSeoPage";
import { loadPartSeoPage } from "@/lib/seo/loadPartSeoPage.server";
import { parseLandingSlug } from "@/lib/seo/parseLandingSlug";
import {
  extractProductIdFromSeoSlug,
  looksLikeProductSlug,
} from "@/lib/seo/productSeoUrl";
import {
  categoryLandingFromMeta,
  fetchCategoryCatalog,
  lookupCategoryByRequestSlug,
} from "@/lib/seo/buildCategoryOwnerPath";
import { SEO_BASE_SLUG, slugifyVi } from "@/lib/seo/slugify";
import { API_BASE } from "@/lib/config";
import {
  buildListingIdentity,
  buildPageTitle,
} from "@/components/pages/home/services/listingSeoState";
import listingUrlHelpers from "@/components/pages/home/services/listingUrlState";

const { buildListingUrlFromIdentity } = listingUrlHelpers;

const CATEGORY_NAME_OVERRIDES = {
  "giam-xoc-truoc-phai": "Giảm Xóc Trước Phải",
};

function normalizeCategoryDisplayName(name) {
  const key = slugifyVi(name);
  return CATEGORY_NAME_OVERRIDES[key] || name;
}

const KNOWN_VEHICLE_BRANDS = [
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
  "mercedes-benz",
  "mercedes",
  "bmw",
  "audi",
  "lexus",
  "vinfast",
  "peugeot",
  "volkswagen",
  "subaru",
  "volvo",
  "daewoo",
];

async function fetchJson(path) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

async function fetchBrandCandidates() {
  const brands = await fetchJson("/filter/brands");
  const rows = Array.isArray(brands) ? brands : [];
  const fromApi = rows
    .map((b) => {
      const name = String(b?.hang_xe || "").trim();
      const tokens = slugifyVi(name).split("-").filter(Boolean);
      return { name, key: tokens.join("-"), tokens };
    })
    .filter((b) => b.key.length);

  const fromKnown = KNOWN_VEHICLE_BRANDS.map((name) => {
    const tokens = slugifyVi(name).split("-").filter(Boolean);
    return { name, key: tokens.join("-"), tokens };
  });

  return [...fromApi, ...fromKnown].sort(
    (a, b) => b.tokens.length - a.tokens.length,
  );
}

const fetchLocationCatalog = cache(async function fetchLocationCatalog() {
  const rows = await fetchJson("/address/provinces");
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => String(row?.tinh_tp || "").trim())
    .filter(Boolean);
});

function normalizeLocationDisplayName(name, locationSlug = "") {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (String(locationSlug || "").startsWith("tp-")) {
    return /^TP Hồ Chí Minh$/i.test(raw) ? "TP Hồ Chí Minh" : raw;
  }
  if (/^TP Hồ Chí Minh$/i.test(raw)) return "TP Hồ Chí Minh";
  if (/^TP\\s+/i.test(raw)) return raw.replace(/^TP\\s+/i, "").trim();
  return raw;
}

function locationSlugCandidates(name) {
  const raw = String(name || "").trim();
  if (!raw) return [];
  const normalized = normalizeLocationDisplayName(raw);
  return [slugifyVi(raw), slugifyVi(normalized)].filter(Boolean);
}

async function resolveLocationNameFromSlug(locationSlug = "") {
  const s = String(locationSlug || "").trim().toLowerCase();
  if (!s) return "";
  const locations = await fetchLocationCatalog();
  const hit = locations.find((name) => locationSlugCandidates(name).includes(s));
  if (hit) return normalizeLocationDisplayName(hit, s);
  return "";
}

function popTrailingYear(tokens) {
  return parseVehicleYearSuffix(tokens).tokens;
}

function popLocationTail(tokens) {
  const next = [...tokens];
  // Location suffix is `…-tai-{place}` (Vietnamese "tại"). Require tokens
  // after `tai` and never strip a leading category token such as "tai" in
  // "Tai Cài …".
  const taiIndex = next.lastIndexOf("tai");
  if (taiIndex > 0 && taiIndex < next.length - 1) {
    return next.slice(0, taiIndex);
  }
  return next;
}

function hasLocationTail(tokens) {
  const list = [...tokens];
  const taiIndex = list.lastIndexOf("tai");
  return taiIndex > 0 && taiIndex < list.length - 1;
}

function displayFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

async function parseLocationOnlyVehicleSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  let locationSlug = "";
  if (s.startsWith("phu-tung-o-to-tai-")) {
    locationSlug = s.slice("phu-tung-o-to-tai-".length).trim();
  } else if (s.startsWith("phu-tung-tai-")) {
    // Legacy alias support: redirect owner will normalize it.
    locationSlug = s.slice("phu-tung-tai-".length).trim();
  } else {
    return null;
  }
  if (!locationSlug) return null;
  const locationName = await resolveLocationNameFromSlug(locationSlug);
  const fallback = {
    "ha-noi": "Hà Nội",
    "tp-ho-chi-minh": "TP Hồ Chí Minh",
  };
  const resolved = locationName || fallback[locationSlug] || "";
  if (!resolved) return null;
  return { locationName: resolved };
}

function matchBrandPrefix(tokens, brandCandidates) {
  const list = tokens.filter(Boolean);
  for (const candidate of brandCandidates) {
    if (list.length < candidate.tokens.length) continue;
    const head = list.slice(0, candidate.tokens.length).join("-");
    if (head === candidate.key) {
      return candidate;
    }
  }
  return null;
}

async function lookupCategoryByName(name) {
  const target = String(name || "").trim();
  if (!target) return null;
  const targetSlug = slugifyVi(target);
  const { rows } = await fetchCategoryCatalog();
  const hit = rows.find((row) => {
    const canonicalName = String(row?.canonical_name || "").trim();
    const categoryName = String(row?.category_name || "").trim();
    if (!canonicalName && !categoryName) return false;
    const canonicalSlug = slugifyVi(canonicalName);
    const categorySlug = slugifyVi(categoryName);
    return (
      canonicalSlug === targetSlug ||
      categorySlug === targetSlug ||
      canonicalName.toLowerCase() === target.toLowerCase() ||
      categoryName.toLowerCase() === target.toLowerCase()
    );
  });
  if (!hit) return null;
  const canonicalName = normalizeCategoryDisplayName(
    String(hit?.canonical_name || hit?.category_name || "").trim(),
  );
  const categoryName = normalizeCategoryDisplayName(
    String(hit?.category_name || hit?.canonical_name || "").trim(),
  );
  return {
    canonicalSlug: String(hit?.canonical_slug || "")
      .trim()
      .toLowerCase(),
    canonicalName,
    categoryName,
    categorySlug: String(hit?.category_slug || hit?.canonical_slug || "")
      .trim()
      .toLowerCase(),
    isAlias: false,
    isCbmy: false,
    isPartVehicle: false,
  };
}

/**
 * `phu-tung-{brand}-{model}[-{year}]` without the `o-to` vehicle hub segment.
 * Keeps routes like `/phu-tung-mazda-6-2024` valid without changing listing UI.
 */
async function isPartVehicleListingSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s.startsWith("phu-tung-")) return false;
  if (s === SEO_BASE_SLUG || s.startsWith(`${SEO_BASE_SLUG}-`)) return false;

  const rawTokens = s.slice("phu-tung-".length).split("-").filter(Boolean);
  if (rawTokens[0] === "tai" && rawTokens.length > 1) return true;
  let tokens = [...rawTokens];
  tokens = popLocationTail(tokens);
  tokens = popTrailingYear(tokens);
  // Accept location-only vehicle slugs:
  // /phu-tung-tai-ha-noi, /phu-tung-tai-hai-phong, ...
  if (!tokens.length) {
    return hasLocationTail(rawTokens);
  }

  const brandCandidates = await fetchBrandCandidates();
  return !!matchBrandPrefix(tokens, brandCandidates);
}

/**
 * Category rows keyed by DB `canonical_slug` (not slugify(category_name)).
 * @returns {Promise<{ canonicalSlug: string, prefix: string }[]>}
 */
async function fetchCategoryCanonicalRows() {
  const { rows: categories } = await fetchCategoryCatalog();
  if (!categories.length) {
    return [];
  }

  const seen = new Set();
  const rows = [];

  for (const raw of categories) {
    const canonicalSlug = String(raw?.canonical_slug || "")
      .trim()
      .toLowerCase();
    if (!canonicalSlug || seen.has(canonicalSlug)) continue;
    seen.add(canonicalSlug);

    const prefix = canonicalSlug.endsWith("-o-to")
      ? canonicalSlug.slice(0, -"-o-to".length)
      : canonicalSlug;

    const canonicalName = String(
      raw?.canonical_name || raw?.category_name || "",
    ).trim();
    const categoryName = String(raw?.category_name || canonicalName).trim();

    rows.push({ canonicalSlug, prefix, canonicalName, categoryName });
  }

  return rows.sort((a, b) => b.prefix.length - a.prefix.length);
}

/**
 * Exact `{canonical_slug}` landing, e.g. `/ma-phanh-o-to`.
 */
async function isCanonicalCategoryLandingSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s.endsWith("-o-to") || s.startsWith(SEO_BASE_SLUG)) return false;

  const rows = await fetchCategoryCanonicalRows();
  return rows.some((row) => row.canonicalSlug === s);
}

/**
 * `{canonical-prefix}-{brand}-{model}[-{year}]` using canonical_slug base only.
 * @returns {Promise<{
 *   canonicalSlug: string,
 *   canonicalName: string,
 *   categoryName: string,
 *   brand: string,
 *   model: string,
 * } | null>}
 */
async function parseCbmyListingSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s || s.endsWith("-o-to") || s.startsWith("phu-tung-")) return null;

  let tokens = s.split("-").filter(Boolean);
  let locationSlug = "";
  const taiIndex = tokens.lastIndexOf("tai");
  if (taiIndex > 0 && taiIndex < tokens.length - 1) {
    locationSlug = tokens.slice(taiIndex + 1).join("-");
    tokens = tokens.slice(0, taiIndex);
  }

  if (!tokens.length) return null;

  const categoryRows = await fetchCategoryCanonicalRows();
  const joined = tokens.join("-");
  const categoryMatch = categoryRows.find(
    (row) => joined === row.prefix || joined.startsWith(`${row.prefix}-`),
  );
  if (!categoryMatch) return null;

  const remainder = joined
    .slice(categoryMatch.prefix.length)
    .replace(/^-/, "");
  if (!remainder) return null;

  const brandCandidates = await fetchBrandCandidates();
  const remainderTokens = remainder.split("-").filter(Boolean);
  const brandMatch = matchBrandPrefix(remainderTokens, brandCandidates);
  if (!brandMatch) return null;

  const { year: resolvedYear, tokens: modelTokens } = parseVehicleYearSuffix(
    remainderTokens.slice(brandMatch.tokens.length),
  );

  let matchedModel = "";
  if (modelTokens.length) {
    const models = await fetchJson(
      `/filter/models?brand=${encodeURIComponent(brandMatch.name)}`,
    );
    const modelRows = Array.isArray(models) ? models : [];
    const modelCandidates = modelRows
      .map((m) => {
        const name = String(m?.ten_xe || "").trim();
        const tks = slugifyVi(name).split("-").filter(Boolean);
        return { name, tokens: tks, key: tks.join("-") };
      })
      .filter((m) => m.key.length)
      .sort((a, b) => b.tokens.length - a.tokens.length);

    for (const candidate of modelCandidates) {
      if (modelTokens.length < candidate.tokens.length) continue;
      const head = modelTokens.slice(0, candidate.tokens.length).join("-");
      if (head === candidate.key) {
        matchedModel = candidate.name;
        break;
      }
    }

    if (!matchedModel) return null;
  }

  let locationName = locationSlug
    ? await resolveLocationNameFromSlug(locationSlug)
    : "";
  if (!locationName && locationSlug) {
    const fallback = {
      "ha-noi": "Hà Nội",
      "tp-ho-chi-minh": "TP Hồ Chí Minh",
    };
    locationName = fallback[locationSlug] || "";
  }

  return {
    canonicalSlug: categoryMatch.canonicalSlug,
    canonicalName: categoryMatch.canonicalName,
    categoryName: categoryMatch.categoryName,
    brand: brandMatch.name,
    model: matchedModel,
    year: resolvedYear,
    location: locationName,
  };
}

/** @param {NonNullable<Awaited<ReturnType<typeof parseCbmyListingSlug>>>} parsed */
function buildCbmyCategoryEntity(parsed) {
  let cbmModel = parsed.model;
  let cbmYear = parsed.year || "";
  if (!cbmYear && cbmModel) {
    const parts = String(cbmModel).split(/\s+/).filter(Boolean);
    const maybeYearRaw = String(parts[parts.length - 1] || "");
    const m =
      maybeYearRaw.match(/^(19|20)\d{2}$/) || maybeYearRaw.match(/^(19|20)\d{2}/);
    if (m) {
      cbmYear = String(m[0]);
      cbmModel = parts.slice(0, -1).join(" ").trim();
    }
  }
  return {
    kind: "category",
    landing: null,
    categoryMeta: {
      canonicalSlug: parsed.canonicalSlug,
      canonicalName: parsed.canonicalName,
      categoryName: parsed.categoryName,
      categorySlug: parsed.canonicalSlug,
      isAlias: false,
      isCbmy: true,
      isPartVehicle: false,
      cbmBrand: parsed.brand,
      cbmModel,
      cbmYear,
      cbmLocation: parsed.location || "",
    },
  };
}

/**
 * @typedef {'product' | 'product_not_found' | 'vehicle' | 'knowledge' | 'category' | 'unknown'} SeoEntityKind
 *
 * @typedef {{
 *   kind: SeoEntityKind,
 *   productMatch?: { id: number, data: object },
 *   vehicleSeo?: object | null,
 *   landing?: object | null,
 *   knowledge?: object | null,
 *   categoryMeta?: {
 *     canonicalSlug: string,
 *     canonicalName: string,
 *     categoryName: string,
 *     categorySlug: string,
 *     isAlias: boolean,
 *     isCbmy: boolean,
 *     isPartVehicle: boolean,
 *     cbmBrand?: string,
 *     cbmModel?: string,
 *   } | null,
 * }} SeoEntity
 */

/**
 * @param {string} slug
 * @param {Awaited<ReturnType<typeof parseLandingSlug>>} landing
 * @returns {Promise<SeoEntity | null>}
 */
async function tryResolveCategoryEntity(slug, landing) {
  const normalized = String(slug || "").trim().toLowerCase();

  const lookup = await lookupCategoryByRequestSlug(normalized);
  if (lookup) {
    return {
      kind: "category",
      landing:
        landing.kind === "category"
          ? landing
          : categoryLandingFromMeta(lookup),
      categoryMeta: lookup,
    };
  }

  if (landing.kind === "category") {
    const categoryName = landing?.filters?.category || "";
    const meta = categoryName ? await lookupCategoryByName(categoryName) : null;
    return meta
      ? { kind: "category", landing, categoryMeta: meta }
      : { kind: "category", landing };
  }

  if (await isCanonicalCategoryLandingSlug(normalized)) {
    const canonicalLookup = await lookupCategoryByRequestSlug(normalized);
    return {
      kind: "category",
      landing: canonicalLookup
        ? categoryLandingFromMeta(canonicalLookup)
        : null,
      categoryMeta: canonicalLookup,
    };
  }

  if (await isPartVehicleListingSlug(normalized)) {
    return {
      kind: "category",
      landing: null,
      categoryMeta: {
        canonicalSlug: "",
        canonicalName: "",
        categoryName: "",
        categorySlug: "",
        isAlias: false,
        isCbmy: false,
        isPartVehicle: true,
      },
    };
  }

  return null;
}

/**
 * Resolve apex `/[slug]` into a known SEO entity. Order:
 * product → CBM → vehicle → category → knowledge → unknown.
 *
 * @param {string} slug
 * @returns {Promise<SeoEntity>}
 */
export const resolveSeoEntity = cache(async function resolveSeoEntity(slug) {
  const normalized = String(slug || "").trim();
  if (!normalized) {
    return { kind: "unknown" };
  }

  if (looksLikeProductSlug(normalized)) {
    const id = extractProductIdFromSeoSlug(normalized);
    if (id != null) {
      const data = await getProductDetailCached(id);
      if (data?.product) {
        return { kind: "product", productMatch: { id, data } };
      }
      return { kind: "product_not_found" };
    }
  }

  const cbmyParsed = await parseCbmyListingSlug(normalized);
  if (cbmyParsed) {
    const modelText = String(cbmyParsed.model || "").trim();
    if (!cbmyParsed.year && modelText) {
      const parts = modelText.split(/\s+/).filter(Boolean);
      const maybeYear = parts[parts.length - 1] || "";
      if (/^(19|20)\\d{2}$/.test(maybeYear)) {
        cbmyParsed.year = maybeYear;
        cbmyParsed.model = parts.slice(0, -1).join(" ").trim();
      }
    }

    if (!cbmyParsed.location && normalized.includes("-tai-")) {
      const locationSlug = normalized.split("-tai-")[1] || "";
      if (locationSlug) {
        const resolvedLocation = await resolveLocationNameFromSlug(locationSlug);
        const fallback = {
          "ha-noi": "Hà Nội",
          "tp-ho-chi-minh": "TP Hồ Chí Minh",
        };
        cbmyParsed.location = resolvedLocation || fallback[locationSlug] || "";
      }
    }
    return buildCbmyCategoryEntity(cbmyParsed);
  }

  const locationOnly = await parseLocationOnlyVehicleSlug(normalized);
  if (locationOnly) {
    const location = locationOnly.locationName;
    const locationIdentity = buildListingIdentity({
      categoryName: "",
      hasCategory: false,
      brand: "",
      model: "",
      year: "",
      location,
    });
    const locationHref = buildListingUrlFromIdentity(locationIdentity);
    const h1 = buildPageTitle({
      categoryName: "",
      hasCategory: false,
      brand: "",
      model: "",
      year: "",
      location,
    });
    return {
      kind: "vehicle",
      vehicleSeo: null,
      landing: {
        kind: "vehicle",
        filters: { location },
        h1,
        breadcrumb: [
          { name: "Trang chủ", href: "/" },
          { name: "Phụ tùng ô tô", href: "/phu-tung-o-to" },
          { name: `Tại ${location}`, href: locationHref },
        ],
      },
    };
  }

  const preLanding = await parseLandingSlug(normalized);
  if (
    preLanding.kind === "vehicle" &&
    String(preLanding.filters?.year || "").includes("-")
  ) {
    return { kind: "vehicle", vehicleSeo: null, landing: preLanding };
  }

  const vehicleSeo = await getVehicleSeoPage(normalized);
  if (vehicleSeo) {
    return { kind: "vehicle", vehicleSeo };
  }

  const landing = await parseLandingSlug(normalized);
  if (landing.kind === "vehicle") {
    return { kind: "vehicle", vehicleSeo: null, landing };
  }

  const categoryEntity = await tryResolveCategoryEntity(normalized, landing);
  if (categoryEntity) {
    return categoryEntity;
  }

  if (!/^phu-tung-/.test(normalized)) {
    const knowledge = await loadPartSeoPage(normalized);
    if (knowledge) {
      return { kind: "knowledge", knowledge };
    }
  }

  return { kind: "unknown" };
});
