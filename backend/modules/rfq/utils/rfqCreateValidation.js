/**
 * RFQ create validation — backend source of truth.
 *
 * Quality gates here improve dispatch/matching: weak descriptions and junk vehicles
 * waste shop attention; normalized brand|model|year feeds dedupe fingerprints and
 * future AI / shop routing. Do not rely on frontend checks alone.
 */

/** Max guest images per RFQ (flat images_json / imageUrls). */
export const RFQ_MAX_CREATE_IMAGES = 10;

const PLACEHOLDER_DESCRIPTIONS = new Set([
  ".",
  "..",
  "aaa",
  "test",
  "123",
  "xxxxx",
  "asdf",
  "abc",
  "none",
  "null",
  "n/a",
  "na",
  "khong",
  "không",
]);

const VN_E164_MOBILE = /^\+84[35789]\d{8}$/;

const MIN_VEHICLE_YEAR = 1950;

export function normalizePhoneVN(raw) {
  let s = String(raw || "").trim().replace(/\s+/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("84")) return `+${s}`;
  if (s.startsWith("0")) return `+84${s.slice(1)}`;
  return `+${s}`;
}

export function isValidVietnamMobileE164(phoneE164) {
  return VN_E164_MOBILE.test(String(phoneE164 || ""));
}

export function isPlaceholderPartDescription(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!t) return true;
  if (PLACEHOLDER_DESCRIPTIONS.has(t)) return true;
  if (/^[.\s\-_]+$/.test(t)) return true;
  const compact = t.replace(/\s/g, "");
  if (/^x{5,}$/i.test(compact)) return true;
  if (/^(.)\1{6,}$/.test(compact)) return true;
  return false;
}

/**
 * @param {unknown} vehicle
 * @returns {{ ok: true, vehicle: { brand: string, model: string, year: number } } | { ok: false, code: string }}
 */
export function validateVehiclePayload(vehicle) {
  if (!vehicle || typeof vehicle !== "object") {
    return { ok: false, code: "INVALID_VEHICLE" };
  }

  const brand = String(vehicle.brand ?? "").trim();
  const model = String(vehicle.model ?? "").trim();
  const yearRaw = vehicle.year != null ? String(vehicle.year).trim() : "";
  const year = yearRaw ? Number(yearRaw) : NaN;
  const maxYear = new Date().getFullYear() + 1;

  if (!brand || brand.length < 2) {
    return { ok: false, code: "INVALID_VEHICLE" };
  }
  if (!model || model.length < 1) {
    return { ok: false, code: "INVALID_VEHICLE" };
  }
  if (!Number.isFinite(year) || year < MIN_VEHICLE_YEAR || year > maxYear) {
    return { ok: false, code: "INVALID_VEHICLE" };
  }

  return { ok: true, vehicle: { brand, model, year } };
}

/**
 * @param {unknown} imageUrls
 */
export function validateImageUrls(imageUrls) {
  if (imageUrls == null || imageUrls === undefined) {
    return { ok: true, imageUrls: [] };
  }
  if (!Array.isArray(imageUrls)) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  const list = [];
  const seen = new Set();
  for (const u of imageUrls) {
    const s = String(u || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    list.push(s);
  }
  if (list.length > RFQ_MAX_CREATE_IMAGES) {
    return { ok: false, code: "TOO_MANY_IMAGES" };
  }
  return { ok: true, imageUrls: list };
}

/**
 * Validate create body; returns normalized fields for persistence.
 * @param {Record<string, unknown>} body
 */
export function validateRfqCreateBody(body) {
  const phoneE164 = normalizePhoneVN(body?.phone);
  if (!phoneE164 || !isValidVietnamMobileE164(phoneE164)) {
    return { ok: false, code: "INVALID_PHONE" };
  }

  const partDescription = String(body?.partDescription ?? "").trim();
  if (partDescription.length < 8) {
    return { ok: false, code: "SHORT_DESCRIPTION" };
  }
  if (partDescription.length > 8000) {
    return { ok: false, code: "LONG_DESCRIPTION" };
  }
  if (isPlaceholderPartDescription(partDescription)) {
    return { ok: false, code: "INVALID_DESCRIPTION" };
  }

  const vehicleResult = validateVehiclePayload(body?.vehicle);
  if (!vehicleResult.ok) {
    return vehicleResult;
  }

  const imagesResult = validateImageUrls(body?.imageUrls);
  if (!imagesResult.ok) {
    return imagesResult;
  }

  return {
    ok: true,
    phoneE164,
    partDescription,
    vehicle: vehicleResult.vehicle,
    imageUrls: imagesResult.imageUrls,
  };
}
