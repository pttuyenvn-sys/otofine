import { API_BASE } from "@/lib/config";
import { fetchJsonCached } from "@/lib/clientJsonCache";

/** Reference filter APIs — shared in-memory cache via fetchJsonCached. */
export const REFERENCE_FILTER_CACHE_TTL_MS = 30 * 60 * 1000;
export const VEHICLE_BRANDS_TTL_MS = REFERENCE_FILTER_CACHE_TTL_MS;
export const VEHICLE_MODELS_TTL_MS = REFERENCE_FILTER_CACHE_TTL_MS;
export const VEHICLE_YEARS_TTL_MS = REFERENCE_FILTER_CACHE_TTL_MS;
export const VEHICLE_SPECS_TTL_MS = REFERENCE_FILTER_CACHE_TTL_MS;
export const VEHICLE_HOT_TTL_MS = REFERENCE_FILTER_CACHE_TTL_MS;

export function getApiList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function sortVehicleOptions(list) {
  return [...list].sort((a, b) => (b?.total || 0) - (a?.total || 0));
}

function pickScalarText(v) {
  if (v == null) return "";
  const t = typeof v;
  if (t === "string" || t === "number") return String(v).trim();
  return "";
}

export function pickBrandLabel(item) {
  if (item == null) return "";
  const tp = typeof item;
  if (tp === "string" || tp === "number") return String(item).trim();
  if (tp !== "object") return "";
  return (
    pickScalarText(item.hang_xe) ||
    pickScalarText(item.brand) ||
    pickScalarText(item.name) ||
    pickScalarText(item.label) ||
    ""
  );
}

export function pickModelLabel(item) {
  if (item == null) return "";
  const tp = typeof item;
  if (tp === "string" || tp === "number") return String(item).trim();
  if (tp !== "object") return "";
  return (
    pickScalarText(item.ten_xe) ||
    pickScalarText(item.model) ||
    pickScalarText(item.name) ||
    pickScalarText(item.label) ||
    ""
  );
}

export function pickYearLabel(item) {
  if (item == null) return "";
  const tp = typeof item;
  if (tp === "string" || tp === "number") return String(item).trim();
  if (tp !== "object") return "";
  return (
    pickScalarText(item.year) ||
    pickScalarText(item.nam_san_xuat) ||
    pickScalarText(item.name) ||
    pickScalarText(item.label) ||
    ""
  );
}

export function filterBrandsUrl() {
  return `${API_BASE}/filter/brands`;
}

export function filterModelsUrl(brand) {
  return `${API_BASE}/filter/models?brand=${encodeURIComponent(brand)}`;
}

export function filterYearsUrl(brand, model) {
  return `${API_BASE}/filter/years?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`;
}

export function filterSpecsUrl(brand, model) {
  return `${API_BASE}/filter/specs?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`;
}

export function filterVehicleHotUrl() {
  return `${API_BASE}/filter/vehicle-hot`;
}

export async function fetchFilterBrands() {
  const data = await fetchJsonCached(filterBrandsUrl(), {
    ttlMs: VEHICLE_BRANDS_TTL_MS,
  });
  return sortVehicleOptions(getApiList(data));
}

export async function fetchFilterModels(brand) {
  const b = String(brand || "").trim();
  if (!b) return [];
  const data = await fetchJsonCached(filterModelsUrl(b), {
    ttlMs: VEHICLE_MODELS_TTL_MS,
  });
  return sortVehicleOptions(getApiList(data));
}

export async function fetchFilterYears(brand, model) {
  const b = String(brand || "").trim();
  const m = String(model || "").trim();
  if (!b || !m) return [];
  const data = await fetchJsonCached(filterYearsUrl(b, m), {
    ttlMs: VEHICLE_YEARS_TTL_MS,
  });
  return getApiList(data);
}

export async function fetchFilterSpecs(brand, model) {
  const b = String(brand || "").trim();
  const m = String(model || "").trim();
  if (!b || !m) {
    return {
      engine: [],
      gearbox: [],
      drivetrain: [],
      bodyType: [],
      cc: [],
    };
  }
  return fetchJsonCached(filterSpecsUrl(b, m), {
    ttlMs: VEHICLE_SPECS_TTL_MS,
  });
}

export async function fetchFilterVehicleHot() {
  return fetchJsonCached(filterVehicleHotUrl(), {
    ttlMs: VEHICLE_HOT_TTL_MS,
  });
}

/**
 * RFQ create API / vehicle_json normalization.
 * Labels must match /filter/* canonical names — rfqFingerprint.stableVehicleKey()
 * and future shop dispatch matching depend on consistent brand|model|year strings.
 */
export function normalizeVehicleForRfqApi({ brand, model, year }) {
  const b = String(brand ?? "").trim();
  const m = String(model ?? "").trim();
  const yRaw = year != null ? String(year).trim() : "";
  const yNum = yRaw ? Number(yRaw) : NaN;
  if (!b || !m || !yRaw || !Number.isFinite(yNum)) {
    return null;
  }
  return { brand: b, model: m, year: yNum };
}
