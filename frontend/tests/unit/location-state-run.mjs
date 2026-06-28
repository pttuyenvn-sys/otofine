import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const FRONTEND = "/var/www/otofine/frontend";
const require = createRequire(path.join(FRONTEND, "package.json"));

const {
  deriveSelectedCityFromLocation,
  locationNameForFilterState,
  LOCATION_OWNERSHIP_BEFORE,
  LOCATION_OWNERSHIP_AFTER,
} = require(path.join(FRONTEND, "components/pages/home/services/locationState.js"));

const listingSeoState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingSeoState.js",
));
const listingUrlState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingUrlState.js",
));
const listingRequestState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingRequestState.js",
));
const listingDerivedState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingDerivedState.js",
));

const { identityFromControllerState } = await import(
  path.join(FRONTEND, "lib/listing/adapters/identityFromControllerState.ts")
);
const { normalizeListingIdentity } = await import(
  path.join(FRONTEND, "lib/listing/normalizeListingIdentity.ts")
);
const { buildListingDisplayLabel } = await import(
  path.join(FRONTEND, "lib/listing/buildListingDisplayLabel.ts")
);
const { buildListingPath } = await import(
  path.join(FRONTEND, "lib/listing/buildListingSlug.ts")
);
const { buildListingQueryString } = await import(
  path.join(FRONTEND, "lib/listing/buildListingQuery.ts")
);

function ok(msg) {
  console.log("PASS:", msg);
}

const LOCATIONS = [
  { id: 1, name: "Hà Nội", slug: "ha-noi", productCount: 100 },
  { id: 2, name: "TP Hồ Chí Minh", slug: "tp-ho-chi-minh", productCount: 50 },
];

try {
  assert.strictEqual(
    deriveSelectedCityFromLocation("Hà Nội", LOCATIONS)?.name,
    "Hà Nội",
  );
  assert.strictEqual(
    deriveSelectedCityFromLocation("Hồ Chí Minh", LOCATIONS)?.slug,
    "tp-ho-chi-minh",
  );
  assert.strictEqual(deriveSelectedCityFromLocation("", LOCATIONS), null);
  ok("deriveSelectedCityFromLocation");

  assert.strictEqual(locationNameForFilterState({ name: "TP Hồ Chí Minh" }), "Hồ Chí Minh");
  ok("locationNameForFilterState");

  const paths = [
    "/phu-tung-kia-tai-ha-noi",
    "/phu-tung-kia-sedona-tai-ha-noi",
    "/ma-phanh-o-to-tai-ha-noi",
  ];

  for (const pathname of paths) {
    const parsed = listingUrlState.parseUrlState(pathname, {
      categories: [],
      brands: [{ brand: "Kia" }],
      locations: LOCATIONS,
      vehicleHot: null,
    });
    const dbLocationName = listingDerivedState.computeDbLocationName(
      LOCATIONS,
      parsed.location,
    );
    const derived = deriveSelectedCityFromLocation(parsed.location, LOCATIONS);

    const legacyH1 = listingSeoState.buildListingIdentity({
      categoryName: parsed.category,
      hasCategory: Boolean(parsed.category),
      brand: parsed.brand,
      model: parsed.model,
      year: parsed.year,
      location: dbLocationName,
    }).h1;

    const controller = {
      ...parsed,
      dbLocationName,
      page: 1,
      sort: "popular",
    };
    const identity = normalizeListingIdentity(
      identityFromControllerState(controller, { locations: LOCATIONS }),
    );
    const shadowH1 = buildListingDisplayLabel(identity);
    const legacyUrl = listingUrlState.buildPathFromState(parsed);
    const shadowUrl = buildListingPath(identity);
    const legacyQuery = listingRequestState.buildProductListParams({
      ...parsed,
      page: 1,
      sort: "popular",
    });
    const shadowQuery = buildListingQueryString(identity, { page: 1, sort: "popular" });

    assert.strictEqual(legacyH1, shadowH1, `h1 ${pathname}`);
    assert.strictEqual(legacyUrl, shadowUrl, `url ${pathname}`);
    assert.ok(derived, `derived city ${pathname}`);
  }
  ok("location URL shadow parity (H1/URL/query)");

  assert.ok(LOCATION_OWNERSHIP_BEFORE.location.length > 0);
  assert.ok(LOCATION_OWNERSHIP_AFTER.selectedCity[0].includes("derive"));
  ok("ownership map exported");

  console.log("Location state unit checks passed.");
} catch (err) {
  console.error("Location state tests failed:", err?.message ?? err);
  process.exitCode = 2;
}
