/**
 * Location ownership documentation (ARCH-MP-03B.3).
 */

export type LocationOwnershipMap = {
  location: string[];
  selectedCity: string[];
  locationSlug: string[];
  dbLocationName: string[];
};

export const LISTING_LOCATION_OWNERSHIP_BEFORE: LocationOwnershipMap = {
  location: [
    "useListingController.location",
    "navigateToState patch",
    "parseUrlState hydrate",
  ],
  selectedCity: [
    "Home.jsx useState",
    "FilterBar setSelectedCity",
    "useEffect selectedCity → navigateToState(location)",
    "useEffect location → setSelectedCity",
    "useEffect placeholder id=0 resolve",
  ],
  locationSlug: [
    "slugify(location) in reverse sync effect",
    "URL path -tai-{slug} via buildPathFromState",
  ],
  dbLocationName: [
    "computeDbLocationName → buildListingIdentity H1",
    "identityFromControllerState dbLocationName ingress",
  ],
};

export const LISTING_LOCATION_OWNERSHIP_AFTER: LocationOwnershipMap = {
  location: [
    "useListingController.location — sole write authority",
    "FilterBar → handleLocationSelect → navigateToState",
  ],
  selectedCity: [
    "deriveSelectedCityFromLocation(location, catalog) — useMemo, read-only",
  ],
  locationSlug: [
    "URL egress only (unchanged buildPathFromState)",
    "locationAdapter ingress (shadow)",
  ],
  dbLocationName: [
    "computeDbLocationName — unchanged presentation layer",
  ],
};
