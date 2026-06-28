import { API_BASE } from "@/lib/config";
import { fetchJsonCached } from "@/lib/clientJsonCache";
import {
  fetchFilterModels,
  fetchFilterVehicleHot,
  filterBrandsUrl,
  filterSpecsUrl,
  filterYearsUrl,
  getApiList,
  VEHICLE_BRANDS_TTL_MS,
  VEHICLE_SPECS_TTL_MS,
  VEHICLE_YEARS_TTL_MS,
} from "@/lib/vehicle/vehicleFilterApi";
import {
  FALLBACK_SEO_TOP_BRANDS,
  FALLBACK_SEO_HOT_MODELS,
  mergeBrandNamesToLength,
  mergeModelRowsToLength,
} from "@/lib/seo/vehicleSeoChips";
import {
  buildFilterCategoriesParams,
  buildLocationsParams,
} from "@/components/pages/home/services/listingRequestState";

export const EMPTY_VEHICLE_SPECS = {
  engine: [],
  gearbox: [],
  drivetrain: [],
  bodyType: [],
  cc: [],
};

export function readRecentSearchesFromStorage(storageKey) {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(arr) ? arr.filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function resolveInitialQuickVehicle(
  initialVehicleFilter,
  quickVehicleStorageKey,
) {
  const parsed = initialVehicleFilter?.parsed;
  if (parsed?.brand) {
    const brand = String(parsed.brand);
    const model = parsed?.model ? String(parsed.model) : "";
    const year = parsed?.year != null ? String(parsed.year) : "";
    return {
      draft: { brand, model, year },
      step: !brand ? 1 : !model ? 2 : 3,
    };
  }

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(quickVehicleStorageKey);
      const stored = raw ? JSON.parse(raw) : null;
      if (stored?.brand) {
        const brand = String(stored.brand);
        const model = stored.model ? String(stored.model) : "";
        const year = stored.year != null ? String(stored.year) : "";
        return {
          draft: { brand, model, year },
          step: !brand ? 1 : !model ? 2 : 3,
        };
      }
    } catch {
      // ignore
    }
  }

  return {
    draft: { brand: "", model: "", year: "" },
    step: 1,
  };
}

async function fetchCategoriesList(params) {
  let url = `${API_BASE}/product-categories/canonical?${params}`;
  let data = await fetchJsonCached(url, { ttlMs: 120_000 });

  if (Array.isArray(data) && data.length > 0) {
    return data.sort(
      (a, b) => (b.total_product_count || 0) - (a.total_product_count || 0),
    );
  }

  url = `${API_BASE}/product-categories?${params}`;
  data = await fetchJsonCached(url, { ttlMs: 120_000 });
  if (Array.isArray(data) && data.length > 0) return data;

  url = `${API_BASE}/filter/categories?${params}`;
  data = await fetchJsonCached(url, { ttlMs: 120_000 });
  return Array.isArray(data) ? data : [];
}

async function fetchModelsForBrand(brand) {
  return fetchFilterModels(brand);
}

async function fetchCatalogSeed() {
  const [brandsResult, hotResult] = await Promise.allSettled([
    fetchJsonCached(filterBrandsUrl(), { ttlMs: VEHICLE_BRANDS_TTL_MS }),
    fetchFilterVehicleHot(),
  ]);

  let brands = [];
  if (brandsResult.status === "fulfilled") {
    brands = [...getApiList(brandsResult.value)].sort(
      (a, b) => (b.total || 0) - (a.total || 0),
    );
  }

  let seoVehicleHot;
  if (hotResult.status === "fulfilled") {
    const body = hotResult.value ?? {};
    const rawBrands = Array.isArray(body?.brands) ? body.brands : [];
    const rawModels = Array.isArray(body?.models) ? body.models : [];
    const namesFromApi = rawBrands.map((b) => b?.name).filter(Boolean);
    const modelsFromApi = rawModels
      .map((r) => ({ brand: r?.brand, model: r?.model }))
      .filter((r) => r.brand && r.model);
    seoVehicleHot = {
      brandNames: mergeBrandNamesToLength(
        namesFromApi,
        FALLBACK_SEO_TOP_BRANDS,
        10,
      ),
      modelRows: mergeModelRowsToLength(
        modelsFromApi,
        FALLBACK_SEO_HOT_MODELS,
        20,
      ),
    };
  } else {
    seoVehicleHot = {
      brandNames: [...FALLBACK_SEO_TOP_BRANDS],
      modelRows: [...FALLBACK_SEO_HOT_MODELS],
    };
  }

  return { brands, seoVehicleHot };
}

/** Static catalog: brands + SEO vehicle-hot chips. Load once on Home mount. */
export function fetchListingCatalogSeed() {
  return fetchCatalogSeed();
}

/** Filter-scoped sidebar / facet metadata (categories, locations, models, years, specs). */
export async function fetchListingFilterSnapshot(filters) {
  const { category, brand, model, year, location, keyword } = filters;

  const catParamString = buildFilterCategoriesParams({
    brand,
    model,
    year,
    location,
    keyword,
  });

  const locParamString = buildLocationsParams({
    category,
    brand,
    model,
    year,
    keyword,
  });
  const locUrl = locParamString
    ? `${API_BASE}/products/locations?${locParamString}`
    : `${API_BASE}/products/locations`;

  const facetTasks = [
    fetchCategoriesList(catParamString),
    fetchJsonCached(locUrl, { ttlMs: 60_000 }).then((data) =>
      Array.isArray(data) ? data : [],
    ),
  ];

  if (brand) {
    facetTasks.push(fetchModelsForBrand(brand));
    if (model) {
      facetTasks.push(
        fetchJsonCached(filterYearsUrl(brand, model), {
          ttlMs: VEHICLE_YEARS_TTL_MS,
        }).then((data) => getApiList(data)),
        fetchJsonCached(filterSpecsUrl(brand, model), {
          ttlMs: VEHICLE_SPECS_TTL_MS,
        }),
      );
    }
  }

  const facetResults = await Promise.all(facetTasks);

  let resultIndex = 0;
  const categories = facetResults[resultIndex++] ?? [];
  const availableLocations = facetResults[resultIndex++] ?? [];

  let models = [];
  let years = [];
  let specs = EMPTY_VEHICLE_SPECS;

  if (brand) {
    models = facetResults[resultIndex++] ?? [];
    if (model) {
      years = facetResults[resultIndex++] ?? [];
      specs = facetResults[resultIndex++] ?? EMPTY_VEHICLE_SPECS;
    }
  }

  return {
    categories,
    availableLocations,
    models,
    years,
    specs,
  };
}
