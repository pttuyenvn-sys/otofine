#!/usr/bin/env node
/**
 * SHOP-OWNERSHIP-02 — Filter read adapter + entity/params parity matrix.
 */

import assert from "node:assert/strict";
import { SHOP_NAMESPACE } from "../lib/shopseo/namespace.js";
import {
  shopEntityToFilterState,
  mergeShopFilterReadState,
} from "../lib/shopseo/shopEntityToFilterState.js";
import { shopPathParamsEqual } from "../lib/shopseo/shopPathParamsShadow.js";

const entityVehicle = {
  namespace: SHOP_NAMESPACE.SHOP_VEHICLE,
  filters: {
    brand: "Toyota",
    model: "Vios",
  },
};

const entityCategoryVehicle = {
  namespace: SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE,
  filters: {
    categorySlug: "loc-gio-o-to",
    brand: "Toyota",
    model: "Vios",
    year: "2020",
  },
};

const cases = [
  {
    name: "null entity → params only",
    entity: null,
    params: { brand: "Honda", model: "City" },
    expect: { brand: "Honda", model: "City" },
  },
  {
    name: "entity wins over params",
    entity: entityVehicle,
    params: { brand: "Honda", model: "City" },
    expect: { brand: "Toyota", model: "Vios" },
  },
  {
    name: "entity partial → params fill gaps",
    entity: entityVehicle,
    params: { brand: "Toyota", model: "Vios", year: "2020" },
    expect: { brand: "Toyota", model: "Vios", year: "2020" },
  },
  {
    name: "collection entity → empty read state",
    entity: {
      namespace: SHOP_NAMESPACE.SHOP_COLLECTION,
      filters: {},
    },
    params: { category: "loc-gio-o-to" },
    expect: { category: "loc-gio-o-to" },
  },
  {
    name: "shopEntityToFilterState maps categorySlug",
    entity: entityCategoryVehicle,
    params: {},
    expectDirect: {
      category: "loc-gio-o-to",
      brand: "Toyota",
      model: "Vios",
      year: "2020",
    },
  },
  {
    name: "empty inputs",
    entity: null,
    params: {},
    expect: {},
  },
];

let failed = 0;

console.log("\n=== SHOP-OWNERSHIP-02 read adapter ===\n");

for (const row of cases) {
  try {
    if (row.expectDirect) {
      const direct = shopEntityToFilterState(row.entity);
      assert.ok(
        shopPathParamsEqual(direct, row.expectDirect),
        `direct ${JSON.stringify(direct)}`,
      );
    } else {
      const merged = mergeShopFilterReadState(row.entity, row.params);
      assert.ok(
        shopPathParamsEqual(merged, row.expect),
        `merged ${JSON.stringify(merged)}`,
      );
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

console.log("\nAll SHOP-OWNERSHIP-02 read adapter cases passed.\n");
