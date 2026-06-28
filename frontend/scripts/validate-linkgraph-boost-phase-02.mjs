#!/usr/bin/env node
/**
 * SEO-LINKGRAPH-BOOST-PHASE-02 — smoke tests.
 */
import assert from "node:assert/strict";
import { projectShopSeoCrawlLinks } from "../lib/shopseo/projectShopSeoCrawlLinks.js";
import { projectShopSeoContextualCrawlLinks } from "../lib/shopseo/projectShopSeoContextualCrawlLinks.js";
import { SHOP_NAMESPACE } from "../lib/shopseo/namespace.js";
import { SHOP_CRAWL_LIMITS } from "../lib/shopseo/projectShopSeoCrawlLinks.shared.js";

const BASE = (process.env.LINKGRAPH_SMOKE_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

console.log("\n=== SEO-LINKGRAPH-BOOST-PHASE-02 ===\n");

assert.equal(SHOP_CRAWL_LIMITS.full.years, 16);
assert.equal(SHOP_CRAWL_LIMITS.collection.years, 8);
assert.equal(SHOP_CRAWL_LIMITS.contextual, 16);
console.log("PASS shop crawl limits");

async function fetchText(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
  assert.equal(res.status, 200, `${path} HTTP ${res.status}`);
  return res.text();
}

const cbmHtml = await fetchText("/ma-phanh-toyota-vios");
assert.ok(cbmHtml.includes("Các đời xe phù hợp"));
assert.match(cbmHtml, /ma-phanh-toyota-vios-\d{4}-\d{4}/);
console.log("PASS marketplace CBM");

const bmyHtml = await fetchText("/phu-tung-toyota-vios");
assert.ok(bmyHtml.includes("Các đời Toyota Vios khác"));
const bmyRangeCount = (bmyHtml.match(/phu-tung-toyota-vios-\d{4}-\d{4}/g) || []).length;
assert.ok(bmyRangeCount >= 12, `BMY should expose more year links (${bmyRangeCount})`);
console.log(`PASS marketplace BMY (${bmyRangeCount} range refs)`);

const bmyRangeHtml = await fetchText("/phu-tung-toyota-vios-2014-2020");
assert.ok(bmyRangeHtml.includes("Các đời Toyota Vios khác"));
assert.ok(
  bmyRangeHtml.includes('href="/phu-tung-toyota-vios"') ||
    bmyRangeHtml.includes("Tất cả đời xe"),
  "BMY_RANGE must link parent BMY",
);
console.log("PASS marketplace BMY_RANGE parent + siblings");

const cbmyRangeHtml = await fetchText("/ma-phanh-toyota-vios-2014-2020");
assert.ok(
  cbmyRangeHtml.includes('href="/ma-phanh-toyota-vios"') ||
    cbmyRangeHtml.includes("Tất cả đời xe"),
  "CBMY_RANGE must link parent CBM",
);
console.log("PASS marketplace CBMY_RANGE parent CBM");

const shopRanges = Array.from({ length: 20 }, (_, i) => ({
  brand: "Toyota",
  model: "Vios",
  yearFrom: String(2000 + i),
  yearTo: String(2002 + i),
  productCount: 5,
}));
const shopGraph = projectShopSeoCrawlLinks({
  shopBasePath: "",
  categories: [{ slug: "ma-phanh-o-to", name: "Má phanh" }],
  fitments: { brands: ["Toyota"], modelsByBrand: { Toyota: ["Vios"] }, years: ["2020"] },
  vehicleYearRanges: shopRanges,
  preset: "full",
});
assert.ok(shopGraph.years.length <= 16);
assert.ok(shopGraph.years.length > 8, "home should emit more than phase-01 year cap");
console.log(`PASS shop home year links (${shopGraph.years.length})`);

const contextual = projectShopSeoContextualCrawlLinks({
  shopBasePath: "",
  categories: [{ slug: "ma-phanh-o-to", name: "Má phanh" }],
  fitments: { brands: ["Toyota"], modelsByBrand: { Toyota: ["Vios"] } },
  vehicleYearRanges: shopRanges,
  entity: {
    namespace: SHOP_NAMESPACE.SHOP_VEHICLE,
    path: "/phu-tung-toyota-vios",
    filters: { brand: "Toyota", model: "Vios" },
  },
});
assert.ok(contextual.related.length <= 16);
assert.ok(contextual.related.length > 8, "contextual cap raised to 16");
console.log(`PASS shop contextual cap (${contextual.related.length})`);

const shopHomeHtml = await fetchText("/shops/phutungoto355");
const shopYearHrefs = shopHomeHtml.match(/\/shops\/phutungoto355\/seo\/[^"]+-\d{4}-\d{4}/g) || [];
assert.ok(shopYearHrefs.length >= 8, "shop home should surface more year-range links");
console.log(`PASS shop home live HTML (${shopYearHrefs.length} year-range hrefs)`);

console.log("\nAll SEO-LINKGRAPH-BOOST-PHASE-02 cases passed.\n");
