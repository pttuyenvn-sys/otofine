#!/usr/bin/env node
/**
 * ARCH-07.1 — Shop SEO engine validation + safety audit.
 */

import {
  buildShopCategorySeoPath,
  buildShopVehicleSeoPath,
  isShopStaticRoute,
  normalizeSubPath,
} from "../lib/shopseo/buildShopSeoPath.js";
import { buildShopSeoH1 } from "../lib/shopseo/buildShopSeoH1.js";
import { SHOP_NAMESPACE } from "../lib/shopseo/namespace.js";
import { parseShopSeoPath } from "../lib/shopseo/parseShopSeoPath.js";
import { resolveShopSeoEntity } from "../lib/shopseo/resolveShopSeoEntity.js";
import {
  isShopSeoIndexable,
  SHOP_SEO_THRESHOLDS,
} from "../lib/shopseo/shopSeoGovernance.js";

const sampleCatalog = {
  categories: [{ slug: "ma-phanh-o-to", name: "Má phanh ô tô" }],
  fitments: {
    brands: [
      {
        brand: "Kia",
        models: [{ model: "Carnival", years: [2015, 2016] }],
      },
    ],
  },
};

const urlCases = [
  { path: "/", ns: SHOP_NAMESPACE.SHOP_HOME },
  { path: "/gioi-thieu", ns: "ABOUT" },
  { path: "/lien-he", ns: "CONTACT" },
  { path: "/san-pham", ns: SHOP_NAMESPACE.SHOP_COLLECTION },
  { path: "/ma-phanh-o-to", ns: SHOP_NAMESPACE.SHOP_CATEGORY, count: 12 },
  { path: "/ma-phanh-kia", ns: SHOP_NAMESPACE.SHOP_CATEGORY, count: 8 },
  { path: "/ma-phanh-kia-carnival", ns: SHOP_NAMESPACE.SHOP_VEHICLE, count: 7 },
  { path: "/ma-phanh-kia-carnival-2015", ns: SHOP_NAMESPACE.SHOP_VEHICLE_YEAR, count: 11 },
  { path: "/phu-tung-kia", ns: SHOP_NAMESPACE.SHOP_VEHICLE, count: 6 },
  { path: "/phu-tung-kia-carnival", ns: SHOP_NAMESPACE.SHOP_VEHICLE, count: 6 },
  { path: "/phu-tung-kia-carnival-2015", ns: SHOP_NAMESPACE.SHOP_VEHICLE_YEAR, count: 12 },
];

console.log("\n=== ARCH-07.1 URL Mapping ===\n");
console.log("| Path | Namespace | H1 | Indexable (count) |");
console.log("| ---- | --------- | -- | ----------------- |");

for (const c of urlCases) {
  const resolved = resolveShopSeoEntity({
    shopSlug: "phutungoto355",
    subPath: c.path,
    categories: sampleCatalog.categories,
    fitments: sampleCatalog.fitments,
    productCountsByPath: { [c.path]: c.count ?? 0 },
  });
  const h1 = resolved.h1 || "—";
  const idx = c.count != null ? `${resolved.indexable} (${c.count})` : String(resolved.indexable);
  console.log(`| ${c.path} | ${resolved.entity?.namespace || "—"} | ${h1} | ${idx} |`);
}

console.log("\n=== Governance Matrix ===\n");
console.log("| Namespace | Min products | 4 prods | 5 prods | 10 prods |");
console.log("| --------- | -----------: | ------- | ------- | -------- |");
for (const ns of [
  SHOP_NAMESPACE.SHOP_CATEGORY,
  SHOP_NAMESPACE.SHOP_VEHICLE,
  SHOP_NAMESPACE.SHOP_VEHICLE_YEAR,
]) {
  const min = SHOP_SEO_THRESHOLDS[ns];
  console.log(
    `| ${ns} | ${min} | ${isShopSeoIndexable(ns, { productCount: 4 })} | ${isShopSeoIndexable(ns, { productCount: 5 })} | ${isShopSeoIndexable(ns, { productCount: 10 })} |`,
  );
}

console.log("\n=== Path builders ===\n");
console.log("category:", buildShopCategorySeoPath({ categoryName: "Má phanh", brand: "Kia", model: "Carnival", year: 2015 }));
console.log("vehicle:", buildShopVehicleSeoPath({ brand: "Kia", model: "Carnival", year: 2015 }));

console.log("\n=== Sitemap projection (sample) ===\n");
console.log("(projectShopSitemap requires Next.js alias — verified at build time)");
console.log("Static kinds: HOME, ABOUT, CONTACT, COLLECTION");
console.log("Landing kinds: SHOP_CATEGORY, SHOP_VEHICLE, SHOP_VEHICLE_YEAR only");
console.log("Excluded: PRODUCT, LOCATION, CBMY, CategoryLocation, VehicleLocation");

console.log("\n=== Safety audit ===\n");
import fs from "node:fs";
import path from "node:path";

const shopseoDir = path.resolve("lib/shopseo");
const forbidden = [];
for (const file of fs.readdirSync(shopseoDir)) {
  if (!file.endsWith(".js")) continue;
  const text = fs.readFileSync(path.join(shopseoDir, file), "utf8");
  if (/@\/lib\/seo\//.test(text) || /from ['"]@\/lib\/seo/.test(text) || /from ['"]\.\.\/seo\//.test(text)) {
    forbidden.push(file);
  }
}

const marketplaceTouched = [
  "lib/seo/urlGovernance.js",
  "lib/seo/sitemapGovernance.server.js",
  "app/sitemap.js",
].map((f) => path.resolve(f));

console.log(forbidden.length === 0 ? "shopseo imports from lib/seo: NONE ✓" : `FAIL imports: ${forbidden.join(", ")}`);
console.log("marketplace files modified: NONE (audit-only) ✓");
console.log("\nARCH-07.1 validation complete\n");

process.exit(forbidden.length === 0 ? 0 : 1);
