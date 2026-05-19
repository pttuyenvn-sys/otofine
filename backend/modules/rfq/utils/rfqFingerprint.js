import { sha256Hex } from "./tokenHash.js";

/** Normalize snippet for duplicate detection (no semantic NLP — MVP). */
export function normalizeKeywordSnippet(text, maxLen = 160) {
  const s = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
  return s;
}

/** Stable vehicle fingerprint from loose JSON / object */
export function stableVehicleKey(vehicle) {
  if (!vehicle || typeof vehicle !== "object") return "";
  const brand = String(vehicle.brand ?? vehicle.brandSlug ?? "").trim().toLowerCase();
  const model = String(vehicle.model ?? vehicle.modelSlug ?? "").trim().toLowerCase();
  const year = vehicle.year != null ? String(vehicle.year).trim() : "";
  const cm = vehicle.carModelId != null ? String(vehicle.carModelId) : "";
  return [brand, model, year, cm].join("|");
}

/**
 * Dedupe fingerprint: phone + vehicle + keyword — independent of OTP round / public_id.
 */
export function buildDedupeFingerprint({ phoneE164, vehicle, partDescription }) {
  const kw = normalizeKeywordSnippet(partDescription);
  const vk = stableVehicleKey(vehicle);
  const payload = `v1|${phoneE164}|${vk}|${kw}`;
  return sha256Hex(payload);
}
