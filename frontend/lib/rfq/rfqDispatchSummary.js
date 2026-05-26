import { normalizeMergedPartDescription } from "./rfqPartDescription.js";

/**
 * Parse shop dispatch / RFQ detail fields for compact summary UI (no extra API).
 */

export function parseVehicleJson(raw) {
  if (!raw) return { brand: "", model: "", year: "", label: "" };
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return { brand: "", model: "", year: "", label: "" };
    }
  }
  const brand = String(v?.brand || "").trim();
  const model = String(v?.model || "").trim();
  const year = v?.year != null && v.year !== "" ? String(v.year) : "";
  const parts = [brand, model, year].filter(Boolean);
  return {
    brand,
    model,
    year,
    label: parts.join(" · ") || "",
  };
}

export function parseImagesJson(raw) {
  if (!raw) return [];
  let arr = raw;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((u) => String(u || "").trim()).filter(Boolean);
}

export function buildShopDispatchSummary(dispatchRow) {
  if (!dispatchRow) {
    return {
      vehicleLabel: "",
      partDescription: "",
      imageCount: 0,
      imageUrls: [],
      status: "",
      rfqStatus: "",
      isUnread: false,
      publicIdShort: "",
    };
  }

  const vehicle = parseVehicleJson(dispatchRow.vehicle_json);
  const imageUrls = parseImagesJson(dispatchRow.images_json);

  return {
    vehicleLabel: vehicle.label,
    partDescription: normalizeMergedPartDescription(dispatchRow.part_description),
    imageCount: imageUrls.length,
    imageUrls,
    status: dispatchRow.status || "",
    rfqStatus: dispatchRow.rfq_status || "",
    isUnread: dispatchRow.first_viewed_at == null,
    publicIdShort: String(dispatchRow.public_id || "").slice(0, 8),
  };
}
