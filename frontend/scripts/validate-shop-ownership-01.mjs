#!/usr/bin/env node
/**
 * SHOP-OWNERSHIP-01 — Single parser ingress validation + legacy shadow matrix.
 */

import assert from "node:assert/strict";
import { pathnameToShopSubPath } from "../lib/shopseo/pathnameToShopSubPath.js";
import {
  shopIdentityFromPathname,
  shopParamsFromPathname,
} from "../lib/shopseo/shopIdentityFromPathname.js";
import { legacyInferSeoParams } from "../lib/shopseo/legacyInferSeoParams.js";
import {
  shopPathParamsEqual,
} from "../lib/shopseo/shopPathParamsShadow.js";
import { SHOP_NAMESPACE } from "../lib/shopseo/namespace.js";

const SHOP_SLUG = "phutungoto355";
const APEX_BASE = `/shops/${SHOP_SLUG}`;

const catalog = {
  categories: [{ slug: "loc-gio-o-to", name: "Lọc gió" }],
  fitments: {
    brands: ["Toyota"],
    modelsByBrand: { Toyota: ["Vios"] },
  },
};

const cases = [
  {
    name: "collection root (subdomain)",
    pathname: "/phu-tung-o-to",
    shopBasePath: "",
    expectNamespace: SHOP_NAMESPACE.SHOP_COLLECTION,
    expectParams: {},
  },
  {
    name: "category",
    pathname: "/loc-gio-o-to",
    shopBasePath: "",
    expectNamespace: SHOP_NAMESPACE.SHOP_CATEGORY,
    expectParams: { category: "loc-gio-o-to" },
  },
  {
    name: "category + vehicle",
    pathname: "/loc-gio-toyota-vios",
    shopBasePath: "",
    expectNamespace: SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE,
    expectParams: {
      category: "loc-gio-o-to",
      brand: "Toyota",
      model: "Vios",
    },
  },
  {
    name: "vehicle",
    pathname: "/phu-tung-toyota-vios",
    shopBasePath: "",
    expectNamespace: SHOP_NAMESPACE.SHOP_VEHICLE,
    expectParams: { brand: "Toyota", model: "Vios" },
  },
  {
    name: "vehicle year",
    pathname: "/phu-tung-toyota-vios-2020",
    shopBasePath: "",
    expectNamespace: SHOP_NAMESPACE.SHOP_VEHICLE_YEAR,
    expectParams: { brand: "Toyota", model: "Vios", year: "2020" },
  },
  {
    name: "vehicle year range",
    pathname: "/phu-tung-toyota-vios-2018-2022",
    shopBasePath: "",
    expectNamespace: SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
    expectParams: { brand: "Toyota", model: "Vios", year: "2018-2022" },
  },
  {
    name: "apex seo listing",
    pathname: `${APEX_BASE}/seo/phu-tung-toyota-vios`,
    shopBasePath: APEX_BASE,
    expectNamespace: SHOP_NAMESPACE.SHOP_VEHICLE,
    expectParams: { brand: "Toyota", model: "Vios" },
    expectLegacyMismatch: true,
  },
  {
    name: "apex direct collection",
    pathname: `${APEX_BASE}/phu-tung-o-to`,
    shopBasePath: APEX_BASE,
    expectNamespace: SHOP_NAMESPACE.SHOP_COLLECTION,
    expectParams: {},
    expectLegacyMismatch: true,
  },
];

let failed = 0;

console.log("\n=== SHOP-OWNERSHIP-01 parser ingress ===\n");

for (const row of cases) {
  const subPath = pathnameToShopSubPath(row.pathname, row.shopBasePath);
  const entity = shopIdentityFromPathname(row.pathname, {
    shopBasePath: row.shopBasePath,
    catalog,
  });
  const params = shopParamsFromPathname(row.pathname, {
    shopBasePath: row.shopBasePath,
    catalog,
  });
  const legacy = legacyInferSeoParams(row.pathname, catalog.fitments);

  try {
    assert.equal(entity?.namespace, row.expectNamespace, "namespace");
    assert.ok(shopPathParamsEqual(params, row.expectParams), `params ${JSON.stringify(params)}`);
    if (row.expectLegacyMismatch) {
      assert.ok(!shopPathParamsEqual(legacy, params), "apex legacy mismatch expected");
    } else {
      assert.ok(shopPathParamsEqual(legacy, params), `legacy shadow ${JSON.stringify(legacy)}`);
    }
    console.log(`PASS ${row.name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL ${row.name}: ${err.message}`);
    console.log("  subPath:", subPath);
    console.log("  entity:", entity?.namespace, entity?.filters);
    console.log("  params:", params);
    console.log("  legacy:", legacy);
  }
}

if (failed > 0) {
  console.log(`\n${failed} case(s) failed.\n`);
  process.exit(1);
}

console.log("\nAll SHOP-OWNERSHIP-01 parser cases passed.\n");
