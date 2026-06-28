/**
 * ARCH-MP-03B.6.1 — client identity egress parity (H1 + URL vs legacy Home builders).
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
const listingDerivedState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingDerivedState.js",
));

const {
  buildClientListingDisplayLabel,
  buildClientListingPath,
  buildClientListingPathFromUrlState,
} = await import(
  path.join(FRONTEND, "lib/listing/adapters/clientListingIdentityEgress.ts")
);
const { runListingIdentityShadow } = await import(
  path.join(FRONTEND, "lib/listing/adapters/listingShadowEntry.ts")
);

function ok(msg) {
  console.log("PASS:", msg);
}

const CATEGORIES = [
  {
    name: "Má phanh",
    category_name: "Má phanh",
    canonical_name: "Má phanh",
    canonical_slug: "ma-phanh-o-to",
    slug: "ma-phanh",
  },
  {
    name: "Cản trước",
    category_name: "Cản trước",
    canonical_name: "Cản Trước",
    canonical_slug: "can-truoc-o-to",
    slug: "can-truoc",
  },
];
const BRANDS = [{ brand: "Toyota" }, { brand: "Kia" }];
const LOCATIONS = [
  { id: 1, name: "Hà Nội", slug: "ha-noi", productCount: 100 },
  { id: 2, name: "TP Hồ Chí Minh", slug: "tp-ho-chi-minh", productCount: 50 },
];

const PARITY_CASES = [
  { pathname: "/ma-phanh-o-to", label: "category" },
  { pathname: "/phu-tung-toyota", label: "brand" },
  { pathname: "/phu-tung-toyota-vios", label: "brand+model" },
  { pathname: "/phu-tung-toyota-vios-2016", label: "brand+model+year" },
  {
    pathname: "/phu-tung-toyota-vios-2016-tai-ha-noi",
    label: "brand+model+year+location",
  },
  { pathname: "/phu-tung-kia-sedona-2014-2020", label: "CBMY range" },
];

function legacyHomeH1(parsed, dbCategoryName, dbLocationName) {
  return listingSeoState.buildListingIdentity({
    categoryName: dbCategoryName,
    hasCategory: Boolean(String(parsed.category || "").trim()),
    brand: parsed.brand,
    model: parsed.model,
    year: parsed.year,
    location: dbLocationName,
  }).h1;
}

function controllerFromParsed(parsed, dbCategoryName, dbLocationName) {
  return {
    ...parsed,
    dbCategoryName,
    dbLocationName,
    page: 1,
    sort: "popular",
  };
}

let h1Pass = 0;
let urlPass = 0;
const shadowDiffs = [];

try {
  for (const { pathname, label } of PARITY_CASES) {
    const parsed = listingUrlState.parseUrlState(pathname, {
      categories: CATEGORIES,
      brands: BRANDS,
      locations: LOCATIONS,
      vehicleHot: null,
    });
    const dbCategoryName = listingDerivedState.computeDbCategoryName(
      CATEGORIES,
      parsed.category,
    );
    const dbLocationName = listingDerivedState.computeDbLocationName(
      LOCATIONS,
      parsed.location,
    );
    const categoryCanonicalSlug = listingDerivedState.resolveCategoryCanonicalSlug(
      CATEGORIES,
      parsed.category,
    );
    const controller = controllerFromParsed(parsed, dbCategoryName, dbLocationName);
    controller.categoryCanonicalSlug = categoryCanonicalSlug;

    const legacyH1 = legacyHomeH1(parsed, dbCategoryName, dbLocationName);
    const identityH1 = buildClientListingDisplayLabel(controller, {
      locations: LOCATIONS,
    });

    const legacyUrl = listingUrlState.buildPathFromState(parsed);
    const identityUrl = buildClientListingPath(controller, {
      locations: LOCATIONS,
      categoryCanonicalSlug,
    });
    const identityUrlFromSlice = buildClientListingPathFromUrlState(parsed, {
      dbCategoryName,
      dbLocationName,
      categoryCanonicalSlug,
      locations: LOCATIONS,
    });

    assert.strictEqual(identityUrl, identityUrlFromSlice, `${label} path ingress`);
    assert.strictEqual(identityUrl, pathname, `${label} expected pathname`);

    if (legacyH1 === identityH1) {
      h1Pass += 1;
    } else {
      console.error(`H1 MISMATCH [${label}]: legacy=${legacyH1} identity=${identityH1}`);
    }

    if (legacyUrl === identityUrl) {
      urlPass += 1;
    } else {
      console.error(`URL MISMATCH [${label}]: legacy=${legacyUrl} identity=${identityUrl}`);
      shadowDiffs.push({ label, field: "url", legacy: legacyUrl, next: identityUrl });
    }

    const prevShadow = process.env.LISTING_IDENTITY_SHADOW;
    process.env.LISTING_IDENTITY_SHADOW = "true";
    const shadow = runListingIdentityShadow({
      controller,
      locations: LOCATIONS,
    });
    if (prevShadow === undefined) delete process.env.LISTING_IDENTITY_SHADOW;
    else process.env.LISTING_IDENTITY_SHADOW = prevShadow;

    if (shadow && !shadow.equal) {
      for (const diff of shadow.diffs) {
        if (diff.field === "h1" || diff.field === "url") {
          shadowDiffs.push({ label, ...diff });
        }
      }
    }
  }

  const total = PARITY_CASES.length;
  console.log(`H1 parity: ${h1Pass}/${total}`);
  console.log(`URL parity: ${urlPass}/${total}`);

  if (shadowDiffs.length) {
    console.log("Shadow diff:");
    for (const d of shadowDiffs) {
      console.log(`  [${d.label}] ${d.field}: legacy=${d.legacy} next=${d.next}`);
    }
  } else {
    console.log("Shadow diff: none (H1/URL)");
  }

  assert.strictEqual(h1Pass, total, "H1 parity incomplete");
  assert.strictEqual(urlPass, total, "URL parity incomplete");

  ok("client identity egress parity matrix");
  console.log("Client identity egress unit checks passed.");
} catch (err) {
  console.error("Client identity egress tests failed:", err?.message ?? err);
  process.exitCode = 2;
}
