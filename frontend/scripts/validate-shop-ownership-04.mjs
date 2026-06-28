#!/usr/bin/env node
/**
 * SHOP-OWNERSHIP-04 — Unified PATH write matrix (select + remove).
 */

import assert from "node:assert/strict";
import { SHOP_COLLECTION_PATH } from "../lib/shopseo/namespace.js";
import { buildShopSeoFilterNavigatePath } from "../lib/shopseo/buildShopSeoFilterNavigatePath.js";
import { shopSeoFilterRemovePatch } from "../lib/shopseo/shopSeoFilterRemovePatch.js";
import { parseShopSeoPath } from "../lib/shopseo/parseShopSeoPath.js";
import { shopEntityFiltersToParams } from "../lib/shopseo/shopIdentityFromPathname.js";

const catalog = {
  categories: [{ slug: "loc-gio-o-to", name: "Lọc gió" }],
  fitments: {
    brands: ["Toyota"],
    modelsByBrand: { Toyota: ["Vios"] },
  },
};

function dimsFromPath(path) {
  const entity = parseShopSeoPath(path, catalog);
  return shopEntityFiltersToParams(entity);
}

const cases = [
  {
    name: "remove brand from vehicle path",
    readFilters: { brand: "Toyota", model: "Vios" },
    remove: "brand",
    expectPath: SHOP_COLLECTION_PATH,
    expectMissing: ["brand", "model"],
  },
  {
    name: "remove model from vehicle path",
    readFilters: { brand: "Toyota", model: "Vios" },
    remove: "model",
    expectPath: "/phu-tung-toyota",
    expectMissing: ["model", "year"],
    expectPresent: { brand: "Toyota" },
  },
  {
    name: "remove year from vehicle+year path",
    readFilters: { brand: "Toyota", model: "Vios", year: "2020" },
    remove: "year",
    expectPath: "/phu-tung-toyota-vios",
    expectMissing: ["year"],
    expectPresent: { brand: "Toyota", model: "Vios" },
  },
  {
    name: "remove category from category+vehicle path",
    readFilters: {
      category: "loc-gio-o-to",
      brand: "Toyota",
      model: "Vios",
      year: "2020",
    },
    remove: "category",
    expectPath: "/phu-tung-toyota-vios-2020",
    expectMissing: ["category"],
    expectPresent: { brand: "Toyota", model: "Vios", year: "2020" },
  },
  {
    name: "select vehicle brand only",
    dims: { brand: "Toyota" },
    expectPath: "/phu-tung-toyota",
  },
];

let failed = 0;

console.log("\n=== SHOP-OWNERSHIP-04 unified PATH write ===\n");

for (const row of cases) {
  try {
    let path;
    if (row.remove) {
      const patch = shopSeoFilterRemovePatch(row.readFilters, row.remove);
      path = await buildShopSeoFilterNavigatePath(patch);
    } else {
      path = await buildShopSeoFilterNavigatePath(row.dims);
    }

    assert.equal(path, row.expectPath, "path");

    if (row.expectMissing || row.expectPresent) {
      const rebuilt = dimsFromPath(path);
      for (const key of row.expectMissing || []) {
        assert.ok(!rebuilt[key], `expected missing ${key}, got ${rebuilt[key]}`);
      }
      for (const [key, value] of Object.entries(row.expectPresent || {})) {
        assert.equal(rebuilt[key], value, `present ${key}`);
      }
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

console.log("\nAll SHOP-OWNERSHIP-04 PATH write cases passed.\n");
