#!/usr/bin/env node
/**
 * SEARCH-VEHICLE-CONTEXT-SUGGEST-01
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  buildCategorySuggestNavigation,
  formatCategorySuggestLabel,
} = require(path.join(
  frontendRoot,
  "components/pages/home/services/categorySuggestVehicleContext.js",
));

const API_BASE = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const WEB_BASE = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

console.log("\n=== SEARCH-VEHICLE-CONTEXT-SUGGEST-01 ===\n");

const vehicleCtx = { brand: "Toyota", model: "Vios" };
const item = {
  canonical_name: "Càng A Phải",
  canonical_slug: "cang-a-phai-o-to",
};

assert.equal(
  formatCategorySuggestLabel(item.canonical_name, vehicleCtx),
  "Càng A Phải Toyota Vios",
);
const nav = buildCategorySuggestNavigation(item, vehicleCtx);
assert.equal(nav.href, "/cang-a-phai-toyota-vios");
assert.equal(nav.state.brand, "Toyota");
assert.equal(nav.state.model, "Vios");
assert.equal(nav.state.category, "Càng A Phải");
console.log("PASS helper label + navigation");

const globalRes = await fetch(
  `${API_BASE}/product-categories/search-sidebar?q=${encodeURIComponent("càng a")}`,
);
const globalBody = await globalRes.json();
const globalCount = globalBody.find((r) => r.canonical_name === "Càng A Phải")?.total_count;

const scopedRes = await fetch(
  `${API_BASE}/product-categories/search-sidebar?q=${encodeURIComponent("càng a")}&brand=Toyota&model=Vios`,
);
const scopedBody = await scopedRes.json();
const scopedCount = scopedBody.find((r) => r.canonical_name === "Càng A Phải")?.total_count;

assert.ok(globalCount > scopedCount, "vehicle scope lowers category count");
assert.equal(scopedCount, 5);
console.log(`PASS API counts global=${globalCount} toyota-vios=${scopedCount}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(60000);
await page.goto(`${WEB_BASE}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded", timeout: 60000 });
const input = page.locator(".of-header-search--desktop .category-search");
await input.waitFor({ state: "visible", timeout: 60000 });
await input.fill("càng a");
await page.waitForTimeout(400);
await page.waitForFunction(() => {
  const groupTitles = [...document.querySelectorAll(".of-header-search--desktop .search-suggest-group__header")].map(
    (el) => el.textContent || "",
  );
  const catLabels = [...document.querySelectorAll(".of-header-search--desktop .search-suggest-cat-row__label")].map(
    (el) => el.textContent || "",
  );
  const labels = [...groupTitles, ...catLabels];
  return labels.some((t) => t.includes("Càng A") && t.includes("Toyota"));
}, { timeout: 60000 });

const labels = [
  ...(await page.locator(".of-header-search--desktop .search-suggest-group__header").allTextContents()),
  ...(await page.locator(".of-header-search--desktop .search-suggest-cat-row__label").allTextContents()),
];
assert.ok(
  labels.some((t) => t.includes("Toyota") && t.includes("Vios")),
  `labels should include vehicle context: ${labels.join(" | ")}`,
);
console.log("PASS UI labels preserve vehicle");

await page.locator(".of-header-search--desktop .search-suggest-group__header").first().click();
await page.waitForTimeout(500);
const pathname = new URL(page.url()).pathname;
assert.ok(
  pathname.includes("toyota") && pathname.includes("vios"),
  `click should preserve vehicle in URL, got ${pathname}`,
);
assert.ok(!pathname.endsWith("-o-to"), `should not be category-only URL: ${pathname}`);
console.log(`PASS click navigates to ${pathname}`);

await browser.close();
console.log("\nALL PASS\n");
