/**
 * ARCH-MP-03B.6.4 — sitemap legacy slug vs ListingIdentity path parity.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const FRONTEND = path.resolve(import.meta.dirname, "../..");
const require = createRequire(path.join(FRONTEND, "package.json"));

const listingSeoState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingSeoState.js",
));
const listingUrlState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingUrlState.js",
));

const { buildListingUrlFromIdentity } = listingUrlState;

const {
  buildSitemapListingPath,
  buildSitemapListingSlug,
} = await import(
  path.join(FRONTEND, "lib/listing/adapters/sitemapListingPath.ts")
);

function ok(msg) {
  console.log("PASS:", msg);
}

function legacyCategoryPath(categoryName, location = "") {
  const identity = listingSeoState.buildListingIdentity({
    categoryName,
    hasCategory: Boolean(categoryName),
    brand: "",
    model: "",
    year: "",
    location,
  });
  return buildListingUrlFromIdentity(identity);
}

function legacyVehicleSlug({ brand, model, year, location } = {}) {
  const identity = listingSeoState.buildListingIdentity({
    categoryName: "",
    hasCategory: false,
    brand: brand || "",
    model: model || "",
    year: year || "",
    location: location || "",
  });
  const p = buildListingUrlFromIdentity(identity);
  return p === "/" ? "" : p.slice(1);
}

function legacyVehiclePath(fields) {
  const slug = legacyVehicleSlug(fields);
  return slug ? `/${slug}` : "/";
}

function assertPathParity(label, legacyPath, identityPath) {
  assert.strictEqual(identityPath, legacyPath, `${label}: path mismatch`);
}

function assertSlugParity(label, legacySlug, identitySlug) {
  assert.strictEqual(identitySlug, legacySlug, `${label}: slug mismatch`);
}

function legacyLocationPath(location) {
  const identity = listingSeoState.buildListingIdentity({
    categoryName: "",
    hasCategory: false,
    brand: "",
    model: "",
    year: "",
    location,
  });
  return buildListingUrlFromIdentity(identity);
}

const CASES = [
  {
    label: "Category",
    row: { category: "Má phanh" },
    legacyPath: () => legacyCategoryPath("Má phanh"),
  },
  {
    label: "Category+Location",
    row: { category: "Má phanh", location: "Hà Nội" },
    legacyPath: () => legacyCategoryPath("Má phanh", "Hà Nội"),
  },
  {
    label: "Brand",
    row: { brand: "Toyota" },
    legacyPath: () => legacyVehiclePath({ brand: "Toyota" }),
    legacySlug: () => legacyVehicleSlug({ brand: "Toyota" }),
  },
  {
    label: "Brand+Model",
    row: { brand: "Toyota", model: "Vios" },
    legacyPath: () => legacyVehiclePath({ brand: "Toyota", model: "Vios" }),
    legacySlug: () => legacyVehicleSlug({ brand: "Toyota", model: "Vios" }),
  },
  {
    label: "BMY",
    row: { brand: "Toyota", model: "Vios", year: "2016" },
    legacyPath: () =>
      legacyVehiclePath({ brand: "Toyota", model: "Vios", year: "2016" }),
    legacySlug: () =>
      legacyVehicleSlug({ brand: "Toyota", model: "Vios", year: "2016" }),
  },
  {
    label: "BMY+Location",
    row: {
      brand: "Toyota",
      model: "Vios",
      year: "2016",
      location: "Hà Nội",
    },
    legacyPath: () =>
      legacyVehiclePath({
        brand: "Toyota",
        model: "Vios",
        year: "2016",
        location: "Hà Nội",
      }),
    legacySlug: () =>
      legacyVehicleSlug({
        brand: "Toyota",
        model: "Vios",
        year: "2016",
        location: "Hà Nội",
      }),
  },
  {
    label: "Range URL",
    row: { brand: "Kia", model: "Sedona", yearFrom: 2014, yearTo: 2020 },
    legacyPath: () =>
      legacyVehiclePath({
        brand: "Kia",
        model: "Sedona",
        year: "2014-2020",
      }),
    legacySlug: () =>
      legacyVehicleSlug({
        brand: "Kia",
        model: "Sedona",
        year: "2014-2020",
      }),
  },
  {
    label: "Location",
    row: { location: "Hà Nội" },
    legacyPath: () => legacyLocationPath("Hà Nội"),
  },
];

let pass = 0;

try {
  for (const testCase of CASES) {
    const identityPath = buildSitemapListingPath(testCase.row);
    const legacyPath = testCase.legacyPath();
    assertPathParity(testCase.label, legacyPath, identityPath);

    if (testCase.legacySlug) {
      const identitySlug = buildSitemapListingSlug(testCase.row);
      assertSlugParity(testCase.label, testCase.legacySlug(), identitySlug);
    }

    pass += 1;
    ok(`${testCase.label} URL parity`);
  }

  // CBM row (sitemap segment — not in minimum list but used in sitemap.js)
  const cbmRow = { category: "Cản trước", brand: "Kia", model: "Sedona" };
  const cbmLegacy = buildListingUrlFromIdentity(
    listingSeoState.buildListingIdentity({
      categoryName: "Cản trước",
      hasCategory: true,
      brand: "Kia",
      model: "Sedona",
      year: "",
      location: "",
    }),
  );
  assert.strictEqual(buildSitemapListingPath(cbmRow), cbmLegacy);
  ok("CBM URL parity");

  console.log(`URL parity: ${pass}/${CASES.length}`);
  console.log("Sitemap identity parity checks passed.");
} catch (err) {
  console.error("Sitemap identity parity tests failed:", err?.message ?? err);
  process.exitCode = 2;
}
