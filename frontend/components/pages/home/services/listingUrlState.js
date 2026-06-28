// Pure helpers for listing URL state parsing and normalization.
// Keep implementations identical to Home.jsx original versions to preserve behavior.
const { buildListingIdentity } = require("./listingSeoState.js");

function isYearToken(token) {
  return /^(19|20)\d{2}$/.test(String(token || ""));
}

function parseVehicleYearSuffix(tokens = []) {
  const list = [...tokens].filter(Boolean);
  if (
    list.length >= 2 &&
    isYearToken(list[list.length - 1]) &&
    isYearToken(list[list.length - 2])
  ) {
    const yearTo = list.pop();
    const yearFrom = list.pop();
    return { year: `${yearFrom}-${yearTo}`, tokens: list };
  }
  if (list.length >= 1 && isYearToken(list[list.length - 1])) {
    return { year: list.pop(), tokens: list };
  }
  return { year: "", tokens: list };
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

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .trim();
}

function displayFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

const LOCATION_SLUG_DISPLAY_FALLBACK = {
  "ha-noi": "Hà Nội",
  "tp-ho-chi-minh": "TP Hồ Chí Minh",
};

function normalizeLocationDisplayName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (/^TP Hồ Chí Minh$/i.test(raw)) return "TP Hồ Chí Minh";
  if (/^TP\s+/i.test(raw)) return raw.replace(/^TP\s+/i, "").trim();
  return raw;
}

function buildLocationSlugCandidates(row) {
  const dbName = String(row?.name || "").trim();
  const dbSlug = String(row?.slug || "").trim().toLowerCase();
  const normalizedName = normalizeLocationDisplayName(dbName);
  return [dbSlug, slugify(dbName), slugify(normalizedName)].filter(Boolean);
}

function resolveLocationDisplayName(row, locationSlug) {
  const dbName = String(row?.name || "").trim();
  if (!dbName) return "";
  if (String(locationSlug || "").toLowerCase().startsWith("tp-")) {
    return /^TP Hồ Chí Minh$/i.test(dbName) ? "TP Hồ Chí Minh" : dbName;
  }
  return normalizeLocationDisplayName(dbName);
}

function rowName(row) {
  return String(row?.canonical_name || row?.category_name || row?.name || row?.brand || row || "").trim();
}

function cleanQueryValue(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const low = trimmed.toLowerCase();
    if (low === "null" || low === "undefined") return null;
    return trimmed;
  }
  return value;
}

function normalizeLocationName(location) {
  return normalizeLocationDisplayName(location);
}

function buildListingUrlFromIdentity(identityInput = {}) {
  const identity = buildListingIdentity(identityInput);
  const canonicalSlug = String(identityInput.canonicalSlug || "")
    .trim()
    .toLowerCase();
  const { hasCategory, brand, model, year, location } = identity;

  if (canonicalSlug && hasCategory && !brand && !model && !year) {
    if (!location) return `/${canonicalSlug}`;
    const locSlug = slugify(location);
    if (locSlug) return `/${canonicalSlug}-tai-${locSlug}`;
    return `/${canonicalSlug}`;
  }

  const h1 = String(identity.h1 || "").trim();
  if (!h1) return "/";
  if (/^Phụ tùng ô tô chính hãng giá tốt$/i.test(h1)) return "/";
  return `/${slugify(h1)}`;
}

function identityInputFromState({ category, brand, model, year, location } = {}) {
  return {
    categoryName: String(category || "").trim(),
    hasCategory: Boolean(String(category || "").trim()),
    brand: String(brand || "").trim(),
    model: String(model || "").trim(),
    year: String(year || "").trim(),
    location: normalizeLocationName(location),
  };
}

// SINGLE URL OWNER
// ListingState -> buildListingIdentity -> buildListingUrlFromIdentity -> URL
function buildListingPathCore(state = {}) {
  return buildListingUrlFromIdentity(identityInputFromState(state));
}

function buildPathFromState(state) {
  return buildListingPathCore(state);
}

function removeVietnamese(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function buildProductIntent(rawCategory, displayH1) {
  const PRODUCT_INTENT_ALIAS_MAP = {
    "can truoc": ["Ba đờ sốc trước", "Bumper trước"],
    "can sau": ["Ba đờ sốc sau", "Bumper sau"],
    "ba do soc truoc": ["Cản trước", "Bumper trước"],
    "ba do soc sau": ["Cản sau", "Bumper sau"],
  };
  const raw = String(rawCategory || "").trim();
  const h1Term = String(displayH1 || "").trim();
  const seed = raw || h1Term;
  if (!seed) return { raw: "", variants: [] };
  const normalized = removeVietnamese(seed).replace(/\s+/g, " ").trim();
  const variants = [];
  const seen = new Set();
  const push = (v) => {
    const s = String(v || "").trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    variants.push(s);
  };
  if (raw) push(raw);
  if (h1Term) push(h1Term);
  const aliases = PRODUCT_INTENT_ALIAS_MAP[normalized] || [];
  aliases.forEach(push);
  if (normalized !== seed.toLowerCase()) {
    push(normalized);
  }
  return { raw: seed, variants };
}

function parseUrlState(pathname, { categories = [], brands = [], locations = [], vehicleHot = null } = {}) {
  const rawSlug = String(pathname || "").replace(/^\//, "").replace(/\/$/, "");

  if (!rawSlug) {
    return { category: "", brand: "", model: "", year: "", location: "" };
  }

  let tokens = rawSlug.split("-").filter(Boolean);
  let location = "";
  const taiIndex = tokens.lastIndexOf("tai");
  if (taiIndex >= 0) {
    const locSlug = tokens.slice(taiIndex + 1).join("-");
    const loc = locations.find((x) => {
      const candidates = buildLocationSlugCandidates(x);
      return candidates.includes(String(locSlug || "").toLowerCase());
    });
    const fallbackDisplay =
      LOCATION_SLUG_DISPLAY_FALLBACK[String(locSlug || "").toLowerCase()] || "";
    location = loc ? resolveLocationDisplayName(loc, locSlug) : fallbackDisplay;
    tokens = tokens.slice(0, taiIndex);
  }

  let year = "";

  let category = "";
  let isPartVehicle = false;
  let categoryRows = [];
  if (tokens[0] === "phu" && tokens[1] === "tung") {
    isPartVehicle = true;
    tokens = tokens.slice(2);
    if (tokens[0] === "o" && tokens[1] === "to") {
      tokens = tokens.slice(2);
    } else {
      const parsedYear = parseVehicleYearSuffix(tokens);
      year = parsedYear.year;
      tokens = parsedYear.tokens;
    }
  } else if (/^(19|20)\d{2}$/.test(tokens[tokens.length - 1] || "")) {
    year = tokens.pop();
  }

  if (!isPartVehicle) {
    categoryRows = categories
      .map((row) => ({ row, name: rowName(row), slug: slugify(rowName(row)) }))
      .filter((x) => x.slug)
      .sort((a, b) => b.slug.length - a.slug.length);
    const joined = tokens.join("-");
    const match = categoryRows.find((x) =>
      joined === x.slug ||
      joined === `${x.slug}-o-to` ||
      joined.startsWith(`${x.slug}-`)
    );
    if (match) {
      category = match.name;
      tokens = tokens.slice(match.slug.split("-").length);
      if (tokens[0] === "o" && tokens[1] === "to") tokens = tokens.slice(2);
    } else if (joined.endsWith("-o-to")) {
      const rawSlug = joined.replace(/-o-to$/, "");

      const exactMatch = categoryRows.find(
        (x) => x.slug === rawSlug
      );

      category = exactMatch?.name || displayFromSlug(rawSlug);

      tokens = [];
    }
  }

  const brandRows = brands
    .map((row) => ({ name: rowName(row), slug: slugify(rowName(row)) }))
    .filter((x) => x.slug)
    .sort((a, b) => b.slug.length - a.slug.length);
  const knownBrandRows = KNOWN_VEHICLE_BRANDS.map((name) => ({
    name: displayFromSlug(name),
    slug: slugify(name),
  }));
  const allBrandRows = [...brandRows, ...knownBrandRows].sort(
    (a, b) => b.slug.length - a.slug.length,
  );
  const rest = tokens.join("-");
  let brandStartIndex = 0;
  let brandMatch = allBrandRows.find(
    (x) => rest === x.slug || rest.startsWith(`${x.slug}-`),
  );
  if (!brandMatch && !isPartVehicle) {
    for (let i = 1; i < tokens.length; i += 1) {
      const tail = tokens.slice(i).join("-");

      const match = allBrandRows.find(
        (x) => tail === x.slug || tail.startsWith(`${x.slug}-`)
      );

      if (match) {
        brandMatch = match;
        brandStartIndex = i;

        if (!category) {
          const categorySlug = tokens.slice(0, i).join("-");

          const categoryMatch = categoryRows.find(
            (x) => x.slug === categorySlug
          );

          category =
            categoryMatch?.name ||
            displayFromSlug(categorySlug);
        }
      }
    }
  }

  const brand =
    brandMatch?.name ||
    (brandMatch?.slug ? displayFromSlug(brandMatch.slug) : "");

  if (brandMatch) {
    tokens = tokens.slice(
      brandStartIndex +
      brandMatch.slug.split("-").length
    );
  }

  const modelSlug = tokens.join("-");

  const modelRows = vehicleHot?.modelRows || [];

  const modelMatch = modelRows.find((row) => {
    const sameBrand =
      !brand ||
      String(row.brand || "").toLowerCase() ===
      String(brand).toLowerCase();

    return (
      sameBrand &&
      slugify(row.model) === slugify(modelSlug)
    );
  });

  let model =
    modelMatch?.model ||
    (modelSlug ? displayFromSlug(modelSlug) : "");

  // Regression guard (ARCH-MP-03B.9B):
  // If parsing failed to pop the year token and a model like "Vios 2020" is present,
  // salvage by splitting a trailing 4-digit year from model → year.
  if (!year && model) {
    const parts = String(model).split(/\s+/).filter(Boolean);
    const maybeYear = parts[parts.length - 1] || "";
    if (isYearToken(maybeYear)) {
      year = maybeYear;
      model = parts.slice(0, -1).join(" ").trim();
    }
  }

  const parsedState = {
    category,
    brand,
    model,
    year,
    location,
  };

  return parsedState;
}

// CommonJS export for compatibility with Node test runner and Next.js bundler
module.exports = {
  KNOWN_VEHICLE_BRANDS,
  slugify,
  displayFromSlug,
  normalizeLocationDisplayName,
  resolveLocationDisplayName,
  LOCATION_SLUG_DISPLAY_FALLBACK,
  rowName,
  cleanQueryValue,
  buildListingUrlFromIdentity,
  buildListingPathCore,
  buildPathFromState,
  removeVietnamese,
  buildProductIntent,
  parseUrlState,
};

