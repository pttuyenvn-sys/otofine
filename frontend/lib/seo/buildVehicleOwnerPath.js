import { buildListingIdentity } from "@/components/pages/home/services/listingSeoState";
import listingUrlHelpers from "@/components/pages/home/services/listingUrlState.js";

const { buildListingUrlFromIdentity } = listingUrlHelpers;

function extractRequestLocationSlug(requestSlug = "") {
  const raw = String(requestSlug || "").trim().toLowerCase();
  const idx = raw.lastIndexOf("-tai-");
  if (idx < 0) return "";
  return raw.slice(idx + "-tai-".length).trim();
}

function normalizeLocationDisplayName(name, requestLocationSlug = "") {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const fallback = {
    "ha-noi": "Hà Nội",
    "tp-ho-chi-minh": "TP Hồ Chí Minh",
  };
  if (fallback[requestLocationSlug]) {
    return fallback[requestLocationSlug];
  }
  if (requestLocationSlug.startsWith("tp-")) {
    return /^TP Hồ Chí Minh$/i.test(raw) ? "TP Hồ Chí Minh" : raw;
  }
  if (/^TP Hồ Chí Minh$/i.test(raw)) return "TP Hồ Chí Minh";
  if (/^TP\\s+/i.test(raw)) return raw.replace(/^TP\\s+/i, "").trim();
  return raw;
}

/**
 * Vehicle listing authority path — delegates to buildListingPathCore (category empty).
 * SINGLE URL OWNER: ListingState -> buildListingPathCore -> URL
 *
 * @param {{ brand?: string, model?: string, year?: string|number|null, location?: string }} p
 * @returns {string} path starting with `/`
 */
export function buildVehicleOwnerPath({ brand, model, year, location } = {}) {
  const identity = buildListingIdentity({
    categoryName: "",
    hasCategory: false,
    brand,
    model,
    year,
    location,
  });
  return buildListingUrlFromIdentity(identity);
}

/**
 * Slug segment without leading slash (sitemap and legacy callers).
 *
 * @param {{ brand?: string, model?: string, year?: string|number|null, location?: string }} p
 * @returns {string} slug segment without leading slash (empty = homepage)
 */
export function buildVehicleOwnerSlug(p) {
  const path = buildVehicleOwnerPath(p);
  return path === "/" ? "" : path.slice(1);
}

/**
 * @param {{ vehicleSeo?: { parsed?: object } | null, landing?: { kind?: string, filters?: object } | null }} entity
 * @returns {string | null}
 */
export function resolveVehicleOwnerPath(entity, requestSlug = "") {
  const requestLocationSlug = extractRequestLocationSlug(requestSlug);
  const parsed = entity?.vehicleSeo?.parsed;
  if (parsed) {
    return buildVehicleOwnerPath({
      brand: parsed.brand,
      model: parsed.model,
      year: parsed.year,
      location: normalizeLocationDisplayName(parsed.locationName, requestLocationSlug),
    });
  }

  if (entity?.landing?.kind === "vehicle") {
    const f = entity.landing.filters || {};
    return buildVehicleOwnerPath({
      brand: f.brand,
      model: f.model,
      year: f.year,
      location: normalizeLocationDisplayName(f.location, requestLocationSlug),
    });
  }

  return null;
}
