/**
 * Marketplace location UI derivation (ARCH-MP-03B.3).
 *
 * Authority: `location` filter state (useListingController).
 * UI: `selectedCity` is derived read-only for dropdown display.
 */
const listingHelpers = require("./listingUrlState.js");
const { slugify } = listingHelpers;

/**
 * @typedef {{ id: number, name: string, slug: string }} SelectedCity
 */

/**
 * Normalize catalog row name to filter `location` string (matches legacy city picker).
 * @param {{ name?: string }} row
 * @returns {string}
 */
function locationNameForFilterState(row) {
  return String(row?.name || "").replace(/^TP\s+/i, "").trim();
}

/**
 * Derive dropdown selection from authoritative `location` state.
 * @param {string} location
 * @param {Array<{ id: number, name: string, slug: string }>} availableLocations
 * @returns {SelectedCity | null}
 */
function deriveSelectedCityFromLocation(location, availableLocations = []) {
  const raw = String(location || "").trim();
  if (!raw || !availableLocations.length) {
    return null;
  }

  const locationSlug = slugify(raw);
  const match = availableLocations.find((loc) => {
    const name = String(loc?.name || "").replace(/^TP\s+/i, "").trim();
    const slugs = [name, loc?.slug].map(slugify).filter(Boolean);
    return slugs.includes(locationSlug);
  });

  if (!match) {
    return null;
  }

  return {
    id: match.id,
    name: match.name,
    slug: match.slug,
  };
}

/** ARCH-MP-03B.3 ownership map (documentation). */
const LOCATION_OWNERSHIP_BEFORE = {
  location: ["useListingController.location", "navigateToState", "parseUrlState"],
  selectedCity: ["Home.jsx useState", "FilterBar setSelectedCity", "bidirectional useEffects"],
  locationSlug: ["derived in location→selectedCity effect via slugify(location)"],
  dbLocationName: ["computeDbLocationName(availableLocations, location) → H1/SEO only"],
};

const LOCATION_OWNERSHIP_AFTER = {
  location: ["useListingController.location — single write authority"],
  selectedCity: ["deriveSelectedCityFromLocation(location) — read-only UI"],
  locationSlug: ["resolveLocationSlugFromDisplay in adapters — ingress only"],
  dbLocationName: ["unchanged — catalog resolve for H1"],
};

module.exports = {
  deriveSelectedCityFromLocation,
  locationNameForFilterState,
  LOCATION_OWNERSHIP_BEFORE,
  LOCATION_OWNERSHIP_AFTER,
};
