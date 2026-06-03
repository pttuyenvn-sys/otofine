/**
 * DEPRECATED
 * Old Phase A1 extracted routing/parser utilities.
 * Do NOT import.
 * Home.jsx contains the active parser implementation (`parseUrlState`, `buildPathFromState`).
 *
 * Kept for reference only. See ROUTE_CONTRACT.md for the live route grammar.
 */

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

function displayFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((x) => {
      if (/\d/.test(x)) {
        return x;
      }

      return x.charAt(0).toUpperCase() + x.slice(1);
    })
    .join(" ");
}

function rowName(row) {
  return String(row?.canonical_name || row?.category_name || row?.name || row?.brand || row || "").trim();
}

/** @deprecated */
export function slugifyMarketplaceSegment(str) {
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

/** @deprecated */
export function normalizeMarketplaceSlug(pathname) {
  return String(pathname || "").replace(/^\//, "").replace(/\/$/, "");
}

/** @deprecated */
export function buildPathFromState({ category, brand, model, year, location }) {
  const parts = [];
  const hasCategory = !!String(category || "").trim();
  const hasContext = !!(brand || model || year || location);

  if (hasCategory) {
    parts.push(slugifyMarketplaceSegment(category));
    if (!hasContext) parts.push("o-to");
  } else if (hasContext) {
    parts.push("phu-tung");
  }

  if (brand) parts.push(slugifyMarketplaceSegment(brand));
  if (model) parts.push(slugifyMarketplaceSegment(model));
  if (year) parts.push(String(year));

  if (location) {
    parts.push("tai");
    parts.push(slugifyMarketplaceSegment(location));
  }

  const slug = parts.filter(Boolean).join("-");
  return slug ? `/${slug}` : "/";
}

/** @deprecated */
export function parseMarketplaceRoute(
  pathname,
  { categories = [], brands = [], locations = [], vehicleHot = null } = {},
) {
  const rawSlug = normalizeMarketplaceSlug(pathname);

  if (!rawSlug) {
    return { category: "", brand: "", model: "", year: "", location: "" };
  }

  let tokens = rawSlug.split("-").filter(Boolean);
  let location = "";
  const taiIndex = tokens.lastIndexOf("tai");
  if (taiIndex >= 0) {
    const locSlug = tokens.slice(taiIndex + 1).join("-");
    const loc = locations.find(
      (x) =>
        x?.slug === locSlug ||
        slugifyMarketplaceSegment(String(x?.name || "").replace(/^TP\s+/i, "")) === locSlug,
    );
    location = loc?.name
      ? String(loc.name).replace(/^TP\s+/i, "").trim()
      : displayFromSlug(locSlug);
    tokens = tokens.slice(0, taiIndex);
  }

  let year = "";
  const lastToken = tokens[tokens.length - 1] || "";
  if (/^\d{4}$/.test(lastToken)) {
    const y = Number(lastToken);
    if (y >= 1950 && y <= 2035) {
      year = tokens.pop();
    }
  }

  let category = "";
  let isPartVehicle = false;
  let categoryRows = [];
  if (tokens[0] === "phu" && tokens[1] === "tung") {
    isPartVehicle = true;
    tokens = tokens.slice(2);
  }

  if (!isPartVehicle) {
    categoryRows = categories
      .map((row) => ({
        row,
        name: rowName(row),
        slug: slugifyMarketplaceSegment(rowName(row)),
      }))
      .filter((x) => x.slug)
      .sort((a, b) => b.slug.length - a.slug.length);
    const joined = tokens.join("-");
    const match = categoryRows.find(
      (x) =>
        joined === x.slug ||
        joined === `${x.slug}-o-to` ||
        joined.startsWith(`${x.slug}-`),
    );
    if (match) {
      category = match.name;
      tokens = tokens.slice(match.slug.split("-").length);
      if (tokens[0] === "o" && tokens[1] === "to") tokens = tokens.slice(2);
    } else if (joined.endsWith("-o-to")) {
      const categorySlug = joined.replace(/-o-to$/, "");

      const exactMatch = categoryRows.find((x) => x.slug === categorySlug);

      category = exactMatch?.name || displayFromSlug(categorySlug);

      tokens = [];
    }
  }

  const modelRows = vehicleHot?.modelRows || [];
  const modelBrandRows = [];
  const seenBrandSlugs = new Set();
  for (const row of modelRows) {
    const name = String(row?.brand || "").trim();
    const slug = slugifyMarketplaceSegment(name);
    if (!name || !slug || seenBrandSlugs.has(slug)) continue;
    seenBrandSlugs.add(slug);
    modelBrandRows.push({ name, slug });
  }

  const brandRows = brands
    .map((row) => ({ name: rowName(row), slug: slugifyMarketplaceSegment(rowName(row)) }))
    .filter((x) => x.slug)
    .sort((a, b) => b.slug.length - a.slug.length);
  const knownBrandRows = KNOWN_VEHICLE_BRANDS.map((name) => ({
    name: displayFromSlug(name),
    slug: slugifyMarketplaceSegment(name),
  }));
  const allBrandRows = [...brandRows, ...modelBrandRows, ...knownBrandRows].sort(
    (a, b) => b.slug.length - a.slug.length,
  );
  const rest = tokens.join("-");
  const brandMatch = allBrandRows.find((x) => {
    if (!x.slug) return false;
    return rest === x.slug || rest.startsWith(`${x.slug}-`);
  });

  const brand =
    brandMatch?.name ||
    (brandMatch?.slug ? displayFromSlug(brandMatch.slug) : "");

  if (brandMatch) {
    tokens = tokens.slice(brandMatch.slug.split("-").length);
  }

  const modelSlug = tokens.join("-");

  const modelCandidates = modelRows
    .map((row) => {
      const rowBrand = String(row?.brand || "").trim();
      const rowModel = String(row?.model || "").trim();
      const brandSlug = slugifyMarketplaceSegment(rowBrand);
      const modelKey = slugifyMarketplaceSegment(rowModel);
      return {
        brand: rowBrand,
        model: rowModel,
        brandSlug,
        modelKey,
        fullKey: brandSlug && modelKey ? `${brandSlug}-${modelKey}` : "",
      };
    })
    .filter((row) => row.brand && row.model && row.modelKey);

  const modelMatch = modelCandidates.find((row) => {
    if (brand && String(row.brand).toLowerCase() !== String(brand).toLowerCase()) {
      return false;
    }
    return modelSlug === row.modelKey || modelSlug === row.fullKey;
  });

  const model = modelMatch?.model || "";

  return {
    category,
    brand,
    model,
    year,
    location,
  };
}

/** @deprecated — use `buildMarketplaceListingRouteKey` from marketplaceListingSession.js */
export function buildMarketplaceListingRouteKey(pathname, search = "") {
  const path = String(pathname || "/").trim() || "/";
  const qs = String(search || "");
  return `${path}${qs.startsWith("?") ? qs : qs ? `?${qs}` : ""}`;
}
