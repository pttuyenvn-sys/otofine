#!/usr/bin/env node
/**
 * SHOP-SEO-LINKGRAPH-01 — Crawl href + link projection smoke tests.
 */

import assert from "node:assert/strict";
import { buildShopSeoCrawlHref } from "../lib/shopseo/buildShopSeoCrawlHref.js";
import { projectShopSeoCrawlLinks } from "../lib/shopseo/projectShopSeoCrawlLinks.js";
import { projectShopSeoContextualCrawlLinks } from "../lib/shopseo/projectShopSeoContextualCrawlLinks.js";
import { resolveShopSeoCrawlLinksVariant } from "../lib/shopseo/resolveShopSeoCrawlLinksVariant.js";
import { SHOP_NAMESPACE } from "../lib/shopseo/namespace.js";
import { SHOP_CRAWL_LIMITS } from "../lib/shopseo/projectShopSeoCrawlLinks.shared.js";

const catalog = {
  categories: [{ slug: "loc-gio-o-to", name: "Lọc gió", productCount: 12 }],
  fitments: {
    brands: ["Toyota"],
    modelsByBrand: { Toyota: ["Vios"] },
    years: ["2020"],
  },
};

console.log("\n=== SHOP-SEO-LINKGRAPH-01 ===\n");

assert.equal(buildShopSeoCrawlHref("", "/loc-gio-o-to"), "/loc-gio-o-to");
assert.equal(
  buildShopSeoCrawlHref("", "/phu-tung-toyota-vios"),
  "/phu-tung-toyota-vios",
);
assert.equal(
  buildShopSeoCrawlHref("/shops/demo", "/phu-tung-o-to"),
  "/shops/demo/phu-tung-o-to",
);
assert.equal(
  buildShopSeoCrawlHref("/shops/demo", "/loc-gio-o-to"),
  "/shops/demo/seo/loc-gio-o-to",
);
console.log("PASS crawl href builder");

const graph = projectShopSeoCrawlLinks({
  shopBasePath: "",
  categories: catalog.categories,
  fitments: catalog.fitments,
});

assert.ok(graph.categories.length > 0, "category links");
assert.ok(graph.vehicles.length > 0, "vehicle links");
console.log("PASS crawl link projection");

const yearGraph = projectShopSeoCrawlLinks({
  shopBasePath: "",
  categories: catalog.categories,
  fitments: catalog.fitments,
  vehicleYearRanges: [
    { brand: "Toyota", model: "Vios", yearFrom: "2014", yearTo: "2020", productCount: 5 },
  ],
  limits: { categories: 8, vehicles: 12, years: 5 },
});
assert.ok(
  yearGraph.years.every((row) =>
    [
      SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE_YEAR,
      SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
      SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
    ].includes(row.namespace),
  ),
  "year links only indexable year namespaces when limits.years > 0",
);
assert.ok(
  !yearGraph.vehicles.some((row) => row.namespace === SHOP_NAMESPACE.SHOP_VEHICLE_YEAR),
  "no deprecated vehicle year namespace in vehicle section",
);

for (const section of [yearGraph.categories, yearGraph.vehicles, yearGraph.years]) {
  for (const row of section) {
    assert.ok(row.href.startsWith("/"), `href ${row.href}`);
    assert.ok(row.label.length > 0, "label");
  }
}

const largeCategories = Array.from({ length: 50 }, (_, i) => ({
  slug: `cat-${i}-o-to`,
  name: `Category ${i}`,
}));
const largeFitments = {
  brands: ["A", "B", "C", "D"],
  modelsByBrand: {
    A: Array.from({ length: 12 }, (_, i) => `ModelA${i}`),
    B: Array.from({ length: 12 }, (_, i) => `ModelB${i}`),
    C: Array.from({ length: 11 }, (_, i) => `ModelC${i}`),
    D: Array.from({ length: 11 }, (_, i) => `ModelD${i}`),
  },
  years: Array.from({ length: 29 }, (_, i) => String(1998 + i)),
};
const t0 = performance.now();
const large = projectShopSeoCrawlLinks({
  shopBasePath: "",
  categories: largeCategories,
  fitments: largeFitments,
});
const elapsed = performance.now() - t0;
assert.equal(large.categories.length, 8);
assert.equal(large.vehicles.length, 12);
assert.ok(large.years.length <= SHOP_CRAWL_LIMITS.full.years, "full preset year cap");
assert.ok(elapsed < 500, `capped projection should be fast (${elapsed.toFixed(1)}ms)`);
console.log(
  `PASS home full preset 8/12/<=${SHOP_CRAWL_LIMITS.full.years} years (${elapsed.toFixed(1)}ms)`,
);

const src = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../lib/shopseo/projectShopSeoCrawlLinks.js", import.meta.url), "utf8"),
);
assert.ok(
  !/\bdiscoverShopSeoLandings\s*\(/.test(src),
  "crawl projection must not call discoverShopSeoLandings()",
);
console.log("PASS no discoverShopSeoLandings in crawl projection");

const collection = projectShopSeoCrawlLinks({
  shopBasePath: "",
  categories: largeCategories,
  fitments: largeFitments,
  preset: "collection",
});
assert.equal(collection.categories.length, 8);
assert.equal(collection.vehicles.length, 8);
assert.ok(collection.years.length <= SHOP_CRAWL_LIMITS.collection.years, "collection year cap");
console.log(
  `PASS collection preset 8/8/<=${SHOP_CRAWL_LIMITS.collection.years} years`,
);

assert.equal(resolveShopSeoCrawlLinksVariant(SHOP_NAMESPACE.SHOP_COLLECTION), "collection");
assert.equal(resolveShopSeoCrawlLinksVariant(SHOP_NAMESPACE.SHOP_CATEGORY), "contextual");
assert.equal(resolveShopSeoCrawlLinksVariant(SHOP_NAMESPACE.SHOP_VEHICLE_YEAR), "contextual");
assert.equal(
  resolveShopSeoCrawlLinksVariant(SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE),
  "contextual",
);
console.log("PASS crawl variant resolver");

const crawlComponent = await import("node:fs").then((fs) =>
  fs.readFileSync(
    new URL("../components/shopsite/ShopSeoCrawlLinks.jsx", import.meta.url),
    "utf8",
  ),
);
assert.ok(
  /Đời xe/.test(crawlComponent),
  "storefront crawl component renders year section when years present",
);
assert.ok(
  !/Tất cả sản phẩm/.test(crawlComponent),
  "storefront crawl component must not render collection heading",
);
assert.ok(
  /Xem tất cả sản phẩm/.test(crawlComponent),
  "home crawl block must include collection CTA",
);
console.log("PASS LINKGRAPH-03 storefront crawl UI");

const contextual = projectShopSeoContextualCrawlLinks({
  shopBasePath: "",
  categories: catalog.categories,
  fitments: catalog.fitments,
  entity: {
    namespace: SHOP_NAMESPACE.SHOP_CATEGORY,
    path: "/loc-gio-o-to",
    filters: { categorySlug: "loc-gio-o-to", categoryName: "Lọc gió" },
  },
});
assert.ok(contextual.related.length <= SHOP_CRAWL_LIMITS.contextual);
console.log("PASS contextual related cap");
console.log("\nAll SHOP-SEO-LINKGRAPH-01 cases passed.\n");
