/**
 * Normalized vehicle fields for RFQ inbox filtering / future conversation threads.
 * Must match buyer create flow (rfqCreateValidation) and stableVehicleKey() in rfqFingerprint.
 */

export function normalizeVehicleBrand(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

export function normalizeVehicleModel(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

export function normalizeVehicleYear(raw) {
  if (raw == null || raw === "") return null;
  const y = Number(String(raw).trim());
  return Number.isFinite(y) ? y : null;
}

/** Parse vehicle_json row field into display + filter keys. */
export function parseVehicleJsonField(vehicleJson) {
  let v = vehicleJson;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  if (!v || typeof v !== "object") {
    return {
      brand: "",
      model: "",
      year: null,
      label: "",
    };
  }
  const brand = String(v.brand ?? "").trim();
  const model = String(v.model ?? "").trim();
  const year = v.year != null ? Number(v.year) : null;
  const parts = [brand, model, year ? String(year) : ""].filter(Boolean);
  return {
    brand,
    model,
    year: Number.isFinite(year) ? year : null,
    label: parts.join(" · "),
  };
}

export function parseInboxFilterQuery(query = {}) {
  const brand = normalizeVehicleBrand(query.brand);
  const model = normalizeVehicleModel(query.model);
  const year = normalizeVehicleYear(query.year);
  const categoryKey = String(query.categoryKey ?? query.category ?? "")
    .trim()
    .toLowerCase();

  return {
    brand,
    model,
    year,
    categoryKey,
  };
}
