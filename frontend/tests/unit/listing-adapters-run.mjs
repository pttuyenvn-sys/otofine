import assert from "node:assert/strict";
import { applyYearSplit, splitLegacyYearString } from "../../lib/listing/adapters/yearSplitAdapter.ts";
import {
  resolveLocationDisplayFromSlug,
  resolveLocationSlugFromDisplay,
} from "../../lib/listing/adapters/locationAdapter.ts";
import { identityFromMarketplaceEntity } from "../../lib/listing/adapters/identityFromMarketplaceEntity.ts";
import { identityFromUrlState } from "../../lib/listing/adapters/identityFromUrlState.ts";
import { identityFromControllerState } from "../../lib/listing/adapters/identityFromControllerState.ts";
import { compareListingIdentityShadow } from "../../lib/listing/adapters/identityShadowCompare.ts";
import { runListingIdentityShadow } from "../../lib/listing/adapters/listingShadowEntry.ts";
import { normalizeListingIdentity } from "../../lib/listing/normalizeListingIdentity.ts";
import { buildListingDisplayLabel } from "../../lib/listing/buildListingDisplayLabel.ts";

function ok(msg) {
  console.log("PASS:", msg);
}

const LOCATIONS = [
  { name: "Hà Nội", slug: "ha-noi" },
  { name: "TP Hồ Chí Minh", slug: "tp-ho-chi-minh" },
];

try {
  // --- yearSplitAdapter ---
  assert.deepStrictEqual(splitLegacyYearString("2014-2020"), {
    yearFrom: 2014,
    yearTo: 2020,
  });
  assert.deepStrictEqual(splitLegacyYearString("2020"), {
    yearFrom: 2020,
    yearTo: 2020,
  });
  assert.deepStrictEqual(
    applyYearSplit({ year: "2014-2020", uiSelectedYear: 2016 }),
    { selectedYear: 2016, yearFrom: 2014, yearTo: 2020 },
  );
  ok("yearSplitAdapter range + UI pick");

  // --- locationAdapter ---
  assert.strictEqual(
    resolveLocationDisplayFromSlug("ha-noi", LOCATIONS),
    "Hà Nội",
  );
  assert.strictEqual(
    resolveLocationSlugFromDisplay("Hà Nội", LOCATIONS),
    "ha-noi",
  );
  ok("locationAdapter slug ↔ display");

  // --- category only ---
  const catOnly = identityFromControllerState({ category: "Má phanh" });
  assert.strictEqual(normalizeListingIdentity(catOnly).category, "Má phanh");
  ok("category only");

  // --- brand only ---
  const brandOnly = identityFromUrlState({ brand: "Kia" });
  assert.strictEqual(normalizeListingIdentity(brandOnly).brand, "Kia");
  ok("brand only");

  // --- brand + model ---
  const bm = identityFromControllerState({ brand: "Kia", model: "Sedona" });
  assert.strictEqual(
    buildListingDisplayLabel(normalizeListingIdentity(bm)),
    "Phụ tùng Kia Sedona",
  );
  ok("brand + model");

  // --- brand + model + range ---
  const bmr = identityFromUrlState({ brand: "Kia", model: "Sedona", year: "2014-2020" });
  const bmrId = normalizeListingIdentity(bmr);
  assert.strictEqual(bmrId.yearFrom, 2014);
  assert.strictEqual(bmrId.yearTo, 2020);
  assert.strictEqual(bmrId.selectedYear, null);
  ok("brand + model + range");

  // --- location ---
  const withLoc = identityFromUrlState(
    { brand: "Kia", location: "Hà Nội" },
    { locations: LOCATIONS },
  );
  assert.strictEqual(normalizeListingIdentity(withLoc).location, "Hà Nội");
  ok("location");

  // --- keyword ---
  const kw = identityFromControllerState({ brand: "Kia", keyword: "lọc gió" });
  assert.strictEqual(normalizeListingIdentity(kw).keyword, "lọc gió");
  ok("keyword");

  // --- CBMY listing (entity) ---
  const cbmyEntity = identityFromMarketplaceEntity({
    kind: "category",
    categoryMeta: {
      canonicalName: "Cản trước",
      cbmBrand: "Kia",
      cbmModel: "Sedona",
      cbmYear: "2014-2020",
    },
  });
  const cbmyId = normalizeListingIdentity(cbmyEntity);
  assert.strictEqual(
    buildListingDisplayLabel(cbmyId),
    "Cản trước Kia Sedona 2014-2020",
  );
  ok("CBMY listing entity");

  // --- vehicle listing (entity) ---
  const vehicleEntity = identityFromMarketplaceEntity({
    kind: "vehicle",
    vehicleSeo: {
      parsed: { brand: "Mazda", model: "6", year: "2024", locationName: "Hà Nội" },
    },
    requestSlug: "phu-tung-mazda-6-2024-tai-ha-noi",
  });
  const vehicleId = normalizeListingIdentity(vehicleEntity);
  assert.strictEqual(vehicleId.brand, "Mazda");
  assert.strictEqual(vehicleId.model, "6");
  assert.strictEqual(vehicleId.yearFrom, 2024);
  assert.strictEqual(vehicleId.location, "Hà Nội");
  ok("vehicle listing entity");

  // --- single year ---
  const singleYear = applyYearSplit({ year: "2020" });
  assert.deepStrictEqual(singleYear, {
    selectedYear: null,
    yearFrom: 2020,
    yearTo: 2020,
  });
  ok("single year");

  // --- range year ---
  const rangeYear = applyYearSplit({ year: "2012-2019" });
  assert.deepStrictEqual(rangeYear, {
    selectedYear: null,
    yearFrom: 2012,
    yearTo: 2019,
  });
  ok("range year");

  // --- shadow compare structure ---
  const diff = compareListingIdentityShadow(
    { h1: "A", url: "/a", query: "brand=Kia" },
    { h1: "A", url: "/a", query: "brand=Kia" },
  );
  assert.strictEqual(diff.equal, true);
  assert.strictEqual(diff.diffs.length, 0);

  const diff2 = compareListingIdentityShadow(
    { h1: "A", url: "/a", query: "" },
    { h1: "B", url: "/b", query: "brand=Kia" },
  );
  assert.strictEqual(diff2.equal, false);
  assert.ok(diff2.diffs.length >= 1);
  ok("identityShadowCompare");

  // --- shadow entry disabled by default ---
  const prev = process.env.LISTING_IDENTITY_SHADOW;
  delete process.env.LISTING_IDENTITY_SHADOW;
  assert.strictEqual(
    runListingIdentityShadow({
      controller: { brand: "Kia", model: "6", year: "2024" },
    }),
    null,
  );
  ok("shadow entry disabled without flag");

  // --- shadow entry enabled ---
  process.env.LISTING_IDENTITY_SHADOW = "true";
  const shadow = runListingIdentityShadow({
    controller: { brand: "Kia", model: "Sedona" },
  });
  assert.ok(shadow);
  assert.ok(typeof shadow.equal === "boolean");
  assert.ok(Array.isArray(shadow.diffs));
  ok("shadow entry enabled with flag");

  if (prev === undefined) delete process.env.LISTING_IDENTITY_SHADOW;
  else process.env.LISTING_IDENTITY_SHADOW = prev;

  console.log("Listing adapter unit checks passed.");
} catch (err) {
  console.error("Listing adapter tests failed:", err?.message ?? err);
  process.exitCode = 2;
}
