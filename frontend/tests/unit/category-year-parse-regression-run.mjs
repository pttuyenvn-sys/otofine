import path from "node:path";
import { createRequire } from "node:module";

const FRONTEND = "/var/www/otofine/frontend";
const require = createRequire(path.join(FRONTEND, "package.json"));

const { API_BASE } = require(path.join(FRONTEND, "lib/config.js"));
const { resolveSeoEntity } = await import(path.join(FRONTEND, "lib/seo/resolveSeoEntity.js"));
const { parseLandingSlug } = await import(path.join(FRONTEND, "lib/seo/parseLandingSlug.js"));

const listingUrlState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingUrlState.js",
));
const listingRequestState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingRequestState.js",
));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function dump(label, value) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(value, null, 2));
}

function buildInitialListingFiltersFromEntity(entity, requestSlug) {
  let initialListingFilters = entity?.landing?.filters || null;
  if (!initialListingFilters && entity?.kind === "category" && entity?.categoryMeta) {
    const meta = entity.categoryMeta;
    const categoryName = meta.canonicalName || meta.categoryName || "";
    initialListingFilters = {
      category: categoryName,
      brand: meta.cbmBrand || "",
      model: meta.cbmModel || "",
      year: meta.cbmYear || "",
      location: meta.cbmLocation || "",
    };
  }
  if (!initialListingFilters && entity?.kind === "vehicle" && entity?.vehicleSeo?.parsed) {
    const parsed = entity.vehicleSeo.parsed;
    const requestLocationSlug =
      String(requestSlug || "").trim().toLowerCase().split("-tai-")[1] || "";
    const normalizeLocation = (name = "") => {
      const raw = String(name || "").trim();
      if (!raw) return "";
      if (requestLocationSlug.startsWith("tp-")) {
        return /^TP Hồ Chí Minh$/i.test(raw) ? "TP Hồ Chí Minh" : raw;
      }
      if (/^TP Hồ Chí Minh$/i.test(raw)) return "TP Hồ Chí Minh";
      if (/^TP\s+/i.test(raw)) return raw.replace(/^TP\s+/i, "").trim();
      return raw;
    };
    initialListingFilters = {
      brand: parsed.brand || "",
      model: parsed.model || "",
      year: parsed.year || "",
      location: normalizeLocation(parsed.locationName || ""),
    };
  }
  return initialListingFilters;
}

function dumpRequestsFromState(state) {
  const canonicalParams = listingRequestState.buildFilterCategoriesParams(state);
  const locationsParams = listingRequestState.buildLocationsParams(state);
  const productsParams = listingRequestState.buildProductListParams({
    ...state,
    page: 1,
    sort: "popular",
  });

  const url = {
    canonicalApi: `${API_BASE}/product-categories/canonical${canonicalParams ? `?${canonicalParams}` : ""}`,
    locationsApi: `${API_BASE}/products/locations${locationsParams ? `?${locationsParams}` : ""}`,
    productsApi: `${API_BASE}/products${productsParams ? `?${productsParams}` : ""}`,
    modelsApi:
      state.brand
        ? `${API_BASE}/filter/models?brand=${encodeURIComponent(state.brand)}`
        : "",
    yearsApi:
      state.brand && state.model
        ? `${API_BASE}/filter/years?brand=${encodeURIComponent(state.brand)}&model=${encodeURIComponent(state.model)}`
        : "",
    specsApi:
      state.brand && state.model
        ? `${API_BASE}/filter/specs?brand=${encodeURIComponent(state.brand)}&model=${encodeURIComponent(state.model)}`
        : "",
  };

  dump("Request params (state → query strings)", {
    canonicalParams,
    locationsParams,
    productsParams,
  });
  dump("Request URLs", url);
}

const requestSlug = process.argv[2] || "can-sau-toyota-vios-2020-tai-ha-noi";
const pathname = `/${requestSlug}`;

console.log("API_BASE:", API_BASE);
console.log("pathname:", pathname);

const entity = await resolveSeoEntity(requestSlug);
dump("resolveSeoEntity(requestSlug)", entity);

const landing = await parseLandingSlug(requestSlug);
dump("parseLandingSlug(requestSlug)", landing);

const initialListingFilters = buildInitialListingFiltersFromEntity(entity, requestSlug);
dump("SSR initialListingFilters (as app/[slug]/page.js would pass)", initialListingFilters);

// Fetch runtime catalogs similar to Home mount/hydration.
const [brands, categories, locations, hot] = await Promise.all([
  fetchJson(`${API_BASE}/filter/brands`).catch(() => []),
  fetchJson(`${API_BASE}/product-categories/canonical`).catch(() => []),
  fetchJson(`${API_BASE}/products/locations`).catch(() => []),
  fetchJson(`${API_BASE}/filter/vehicle-hot`).catch(() => null),
]);

const seoVehicleHot = hot
  ? {
      brandNames: Array.isArray(hot?.brands) ? hot.brands.map((b) => b?.name).filter(Boolean) : [],
      modelRows: Array.isArray(hot?.models)
        ? hot.models
            .map((r) => ({ brand: r?.brand, model: r?.model }))
            .filter((r) => r.brand && r.model)
        : [],
    }
  : null;

dump("Catalog sizes", {
  brands: Array.isArray(brands) ? brands.length : 0,
  categories: Array.isArray(categories) ? categories.length : 0,
  locations: Array.isArray(locations) ? locations.length : 0,
  hotModels: seoVehicleHot?.modelRows?.length || 0,
});

const parsedUrlState = listingUrlState.parseUrlState(pathname, {
  categories,
  brands,
  locations,
  vehicleHot: seoVehicleHot,
});
dump("Client parseUrlState(pathname)", parsedUrlState);

dumpRequestsFromState(parsedUrlState);

// Also demonstrate the *bad* shape the bug report suspects, to show how it affects request params.
const badShape = {
  category: parsedUrlState.category,
  brand: parsedUrlState.brand,
  model: `${parsedUrlState.model} ${parsedUrlState.year}`.trim(),
  year: "",
  location: parsedUrlState.location,
};
dump("Synthetic BAD shape (year stuck in model)", badShape);
dumpRequestsFromState(badShape);

