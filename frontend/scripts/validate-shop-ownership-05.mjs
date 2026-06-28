#!/usr/bin/env node
/**
 * SHOP-OWNERSHIP-05 — Query overlay removed; PATH-only SEO dimension reads.
 */

import assert from "node:assert/strict";
import { SHOP_NAMESPACE } from "../lib/shopseo/namespace.js";
import { shopParamsFromPathname } from "../lib/shopseo/shopIdentityFromPathname.js";
import { mergeShopFilterReadState } from "../lib/shopseo/shopEntityToFilterState.js";
import { parseShopSeoPath } from "../lib/shopseo/parseShopSeoPath.js";
import { shopEntityFiltersToParams } from "../lib/shopseo/shopIdentityFromPathname.js";

const catalog = {
  categories: [{ slug: "loc-gio-o-to", name: "Lọc gió" }],
  fitments: {
    brands: ["Toyota"],
    modelsByBrand: { Toyota: ["Vios"] },
  },
};

function readFiltersFor(pathname, entity, queryOverlay = {}) {
  const pathFilters = shopParamsFromPathname(pathname, { shopBasePath: "", catalog });
  // Overlay must NOT be merged — simulate hook ignoring query for SEO dims.
  void queryOverlay;
  return mergeShopFilterReadState(entity, pathFilters);
}

const collectionEntity = {
  namespace: SHOP_NAMESPACE.SHOP_COLLECTION,
  filters: {},
};

const vehicleEntity = {
  namespace: SHOP_NAMESPACE.SHOP_VEHICLE,
  filters: { brand: "Toyota", model: "Vios" },
};

const vehicleYearEntity = {
  namespace: SHOP_NAMESPACE.SHOP_VEHICLE_YEAR,
  filters: { brand: "Toyota", model: "Vios", year: "2020" },
};

const cases = [
  {
    name: "collection + ?brand=Toyota overlay ignored",
    pathname: "/phu-tung-o-to",
    entity: collectionEntity,
    overlay: { brand: "Toyota" },
    expect: {},
  },
  {
    name: "collection + ?year=2020 overlay ignored",
    pathname: "/phu-tung-o-to",
    entity: collectionEntity,
    overlay: { year: "2020" },
    expect: {},
  },
  {
    name: "vehicle path brand/model",
    pathname: "/phu-tung-toyota-vios",
    entity: vehicleEntity,
    overlay: {},
    expect: { brand: "Toyota", model: "Vios" },
  },
  {
    name: "vehicle year path",
    pathname: "/phu-tung-toyota-vios-2020",
    entity: vehicleYearEntity,
    overlay: {},
    expect: { brand: "Toyota", model: "Vios", year: "2020" },
  },
  {
    name: "path conflict overlay ignored (entity wins)",
    pathname: "/phu-tung-toyota-vios",
    entity: vehicleEntity,
    overlay: { brand: "Honda" },
    expect: { brand: "Toyota", model: "Vios" },
  },
  {
    name: "home no entity — path-only fallback",
    pathname: "/phu-tung-toyota-vios",
    entity: null,
    overlay: { brand: "Honda" },
    expect: { brand: "Toyota", model: "Vios" },
  },
];

let failed = 0;

console.log("\n=== SHOP-OWNERSHIP-05 overlay removal ===\n");

for (const row of cases) {
  try {
    const readFilters = readFiltersFor(row.pathname, row.entity, row.overlay);
    const parsed = shopEntityFiltersToParams(
      parseShopSeoPath(row.pathname, catalog),
    );
    for (const key of ["category", "brand", "model", "year"]) {
      const expected = row.expect[key];
      const actual = readFilters[key];
      if (expected == null) {
        assert.ok(!actual, `expected no ${key}, got ${actual}`);
      } else {
        assert.equal(actual, expected, key);
      }
    }
    if (row.entity) {
      const entityDims = shopEntityFiltersToParams(row.entity);
      for (const key of ["category", "brand", "model", "year"]) {
        if (entityDims[key]) {
          assert.equal(readFilters[key], entityDims[key], `entity ${key}`);
        }
      }
    } else {
      assert.deepEqual(readFilters, parsed);
    }
    console.log(`PASS ${row.name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL ${row.name}: ${err.message}`);
  }
}

if (failed > 0) {
  console.log(`\n${failed} case(s) failed.\n`);
  process.exit(1);
}

console.log("\nAll SHOP-OWNERSHIP-05 overlay removal cases passed.\n");
