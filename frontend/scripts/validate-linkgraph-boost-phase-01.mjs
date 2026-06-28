#!/usr/bin/env node
/**
 * SEO-LINKGRAPH-BOOST-PHASE-01 — coverage smoke tests.
 * Shop: unit projection. Marketplace: live HTML smoke (avoids @/ server imports).
 */
import assert from "node:assert/strict";
import { projectShopSeoCrawlLinks } from "../lib/shopseo/projectShopSeoCrawlLinks.js";
import { projectShopSeoContextualCrawlLinks } from "../lib/shopseo/projectShopSeoContextualCrawlLinks.js";
import { SHOP_NAMESPACE } from "../lib/shopseo/namespace.js";

const BASE = (process.env.LINKGRAPH_SMOKE_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

console.log("\n=== SEO-LINKGRAPH-BOOST-PHASE-01 ===\n");

async function fetchText(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
  assert.equal(res.status, 200, `${path} HTTP ${res.status}`);
  return res.text();
}

// --- Marketplace (live HTML) ---
const cbmHtml = await fetchText("/ma-phanh-toyota-vios");
assert.ok(cbmHtml.includes("Các đời xe phù hợp"), "CBM section title");
assert.match(cbmHtml, /ma-phanh-toyota-vios-\d{4}-\d{4}/, "CBM year-range href");
console.log("PASS marketplace CBM live HTML");

const bmyHtml = await fetchText("/phu-tung-toyota-vios");
assert.ok(bmyHtml.includes("Các đời Toyota Vios khác"), "BMY section title");
assert.match(bmyHtml, /phu-tung-toyota-vios-\d{4}-\d{4}/, "BMY year-range href");
console.log("PASS marketplace BMY live HTML");

const bmyRangeHtml = await fetchText("/phu-tung-toyota-vios-2014-2020");
assert.ok(bmyRangeHtml.includes("Các đời Toyota Vios khác"), "BMY_RANGE sibling section");
console.log("PASS marketplace BMY_RANGE sibling live HTML");

// --- Shop projection ---
const shopRanges = [
  { brand: "Toyota", model: "Vios", yearFrom: "2014", yearTo: "2020", productCount: 5 },
  { brand: "Toyota", model: "Vios", yearFrom: "2008", yearTo: "2013", productCount: 4 },
  { brand: "Toyota", model: "Vios", yearFrom: "2021", yearTo: "2025", productCount: 3 },
];
const shopGraph = projectShopSeoCrawlLinks({
  shopBasePath: "",
  categories: [{ slug: "ma-phanh-o-to", name: "Má phanh" }],
  fitments: { brands: ["Toyota"], modelsByBrand: { Toyota: ["Vios"] }, years: ["2020"] },
  vehicleYearRanges: shopRanges,
  preset: "full",
});
assert.ok(shopGraph.years.length > 0, "shop home emits year-range crawl links");
const yearNs = new Set(shopGraph.years.map((r) => r.namespace));
assert.ok(yearNs.has(SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE));
assert.ok(yearNs.has(SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE));
console.log(`PASS shop home year links (${shopGraph.years.length})`);

const contextual = projectShopSeoContextualCrawlLinks({
  shopBasePath: "",
  categories: [{ slug: "ma-phanh-o-to", name: "Má phanh" }],
  fitments: { brands: ["Toyota"], modelsByBrand: { Toyota: ["Vios"] } },
  vehicleYearRanges: shopRanges,
  entity: {
    namespace: SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE,
    path: "/ma-phanh-o-to-toyota-vios",
    filters: {
      categorySlug: "ma-phanh-o-to",
      categoryName: "Má phanh",
      brand: "Toyota",
      model: "Vios",
    },
  },
});
assert.ok(contextual.related.length > 0, "contextual CBMV → year-range");
console.log(`PASS shop contextual year links (${contextual.related.length})`);

// --- Shop live HTML ---
const shopHomeHtml = await fetchText("/shops/phutungoto355");
assert.ok(shopHomeHtml.includes("Đời xe"), "shop home year section");
assert.match(
  shopHomeHtml,
  /\/shops\/phutungoto355\/seo\/[^"]+-\d{4}-\d{4}/,
  "shop home year-range href",
);
console.log("PASS shop home live HTML");

console.log("\nAll SEO-LINKGRAPH-BOOST-PHASE-01 cases passed.\n");
