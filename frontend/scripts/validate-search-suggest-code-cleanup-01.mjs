#!/usr/bin/env node
/**
 * SEARCH-SUGGEST-CODE-CLEANUP-01 — dead code removed; production popup unchanged.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

const FRONTEND = path.resolve(import.meta.dirname, "..");
const WEB_BASE = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

console.log("\n=== SEARCH-SUGGEST-CODE-CLEANUP-01 ===\n");

const deadFiles = [
  "components/pages/home/header/SearchSuggestPanel.jsx",
];
for (const rel of deadFiles) {
  assert.ok(!fs.existsSync(path.join(FRONTEND, rel)), `dead file still exists: ${rel}`);
}
console.log("PASS dead files removed");

const homeSrc = fs.readFileSync(path.join(FRONTEND, "components/pages/Home.jsx"), "utf8");
assert.ok(!homeSrc.includes("SearchSuggestPanel"), "Home.jsx must not import SearchSuggestPanel");
assert.ok(!homeSrc.includes("renderSearchPanelOnly"), "Home.jsx must not define renderSearchPanelOnly");
assert.ok(homeSrc.includes("searchSuggestResponse"), "Home.jsx uses unified suggest response");
assert.ok(!homeSrc.includes("fetchSearchSuggestProgressive"), "Home.jsx must not use progressive dual fetch");
console.log("PASS Home.jsx dead paths removed");

const browser = await chromium.launch({ headless: true });

const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
desktop.setDefaultTimeout(60000);
await desktop.goto(`${WEB_BASE}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded", timeout: 60000 });
const dInput = desktop.locator(".of-header-search--desktop .category-search");
await dInput.waitFor({ state: "visible", timeout: 60000 });
await dInput.fill("giảm xóc vios");
await desktop.waitForTimeout(400);
await desktop.waitForFunction(
  () => {
    const panel = document.querySelector(".of-header-search--desktop .search-suggest-panel");
    const blocks = document.querySelectorAll(
      ".of-header-search--desktop .search-suggest-group",
    ).length;
    const products = document.querySelectorAll(
      ".of-header-search--desktop .search-suggest-list--panel .search-suggest-item",
    ).length;
    return panel && blocks > 0 && products > 0;
  },
  { timeout: 60000 },
);
const dBlocks = await desktop
  .locator(".of-header-search--desktop .search-suggest-group")
  .count();
const dProducts = await desktop
  .locator(".of-header-search--desktop .search-suggest-list--panel .search-suggest-item")
  .count();
assert.ok(dBlocks > 0 && dBlocks <= 3, "desktop: category blocks");
assert.ok(dProducts > 0 && dProducts <= 6, "desktop: product preview");
assert.equal(
  await desktop.locator(".search-suggest-wrap--split").count(),
  0,
  "desktop: no dead split layout",
);
console.log(`PASS desktop popup (blocks=${dBlocks}, products=${dProducts})`);

const mobile = await browser.newPage({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});
mobile.setDefaultTimeout(60000);
await mobile.goto(`${WEB_BASE}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded", timeout: 60000 });
const mInput = mobile.locator(".of-header-search--mobile .category-search");
await mInput.click();
await mInput.fill("càng a");
await mobile.waitForTimeout(400);
await mobile.waitForFunction(
  () => {
    const panel = document.querySelector(".of-mobile-search-overlay .search-suggest-panel");
    const cats = document.querySelectorAll(
      ".of-mobile-search-overlay .search-suggest-group",
    ).length;
    const products = document.querySelectorAll(
      ".of-mobile-search-overlay .search-suggest-list--panel .search-suggest-item",
    ).length;
    return panel && cats > 0 && products > 0;
  },
  { timeout: 60000 },
);
const mBlocks = await mobile
  .locator(".of-mobile-search-overlay .search-suggest-group")
  .count();
const mProducts = await mobile
  .locator(".of-mobile-search-overlay .search-suggest-list--panel .search-suggest-item")
  .count();
assert.ok(mBlocks > 0, "mobile: category blocks");
assert.ok(mProducts > 0 && mProducts <= 6, "mobile: product preview");
console.log(`PASS mobile popup (blocks=${mBlocks}, products=${mProducts})`);

await browser.close();
console.log("\nALL PASS — SEARCH-SUGGEST-CODE-CLEANUP-01\n");
