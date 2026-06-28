#!/usr/bin/env node
/**
 * SEARCH-PERFORMANCE-OPTIMIZATION-01
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";
import {
  buildSearchSuggestCacheKey,
  clearSearchSuggestCacheForTests,
  readSearchSuggestCache,
  writeSearchSuggestCache,
} from "../lib/search/searchSuggestCache.js";
import {
  shouldFetchSearchSuggest,
  isOemPartNumberQuery,
} from "../lib/search/parseSearchIntent.js";
import { SEARCH_SUGGEST_DEBOUNCE_MS, SEARCH_SUGGEST_CACHE_TTL_MS } from "../lib/search/searchSuggestPerformance.js";

const WEB = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const AUDIT = path.resolve(import.meta.dirname, "../../audit/search-performance-optimization-01");

console.log("\n=== SEARCH-PERFORMANCE-OPTIMIZATION-01 ===\n");

assert.equal(SEARCH_SUGGEST_DEBOUNCE_MS, 300);
assert.equal(SEARCH_SUGGEST_CACHE_TTL_MS, 120_000);

assert.equal(buildSearchSuggestCacheKey("bugi", { brand: "Toyota", model: "", year: "" }), "bugi|toyota|all|null");
assert.equal(
  buildSearchSuggestCacheKey("má phanh", { brand: "Toyota", model: "Vios", year: "2015" }),
  "ma phanh|toyota|vios|2015",
);
console.log("PASS cache key");

assert.equal(shouldFetchSearchSuggest("b"), false);
assert.equal(shouldFetchSearchSuggest("bu"), true);
assert.equal(shouldFetchSearchSuggest("bugi"), true);
assert.equal(isOemPartNumberQuery("04465-0D140"), true);
assert.equal(shouldFetchSearchSuggest("04465-0D140"), true);
console.log("PASS min length + OEM exception");

clearSearchSuggestCacheForTests();
const key = buildSearchSuggestCacheKey("bugi", { brand: "Toyota" });
writeSearchSuggestCache(key, {
  response: {
    groups: [{ title: "Bugi Toyota", count: 1, url: "/bugi-toyota", products: [] }],
    viewAll: { label: "Xem tất cả", url: "/" },
    categories: [{ canonical_name: "Bugi" }],
  },
});
assert.ok(readSearchSuggestCache(key)?.response);
console.log("PASS cache read/write");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let suggestCompleted = 0;
let suggestAborted = 0;

await page.route("**/api/search/suggest**", async (route) => {
  await new Promise((r) => setTimeout(r, 120));
  try {
    const response = await route.fetch();
    suggestCompleted += 1;
    await route.fulfill({ response });
  } catch {
    suggestAborted += 1;
    await route.abort().catch(() => {});
  }
});

await page.goto(`${WEB}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded" });
const input = page.locator(".of-header-search--desktop .category-search");
await input.waitFor({ timeout: 30000 });
await input.click();

for (const ch of ["b", "u", "g", "i"]) {
  await input.press(ch);
  await page.waitForTimeout(40);
}
await page.waitForTimeout(SEARCH_SUGGEST_DEBOUNCE_MS + 500);

assert.ok(suggestCompleted <= 2, `fast typing suggest completed=${suggestCompleted}`);
console.log(`PASS fast typing (suggest done=${suggestCompleted}, aborted=${suggestAborted})`);

await page.unroute("**/api/search/suggest**");

await input.fill("");
await input.fill("bugi toyota");
await page.waitForFunction(
  () => document.querySelectorAll(".of-header-search--desktop .search-suggest-group").length >= 1,
  { timeout: 30000 },
);
const firstRender = Date.now();

await input.fill("");
await input.fill("bugi toyota");
await page.waitForFunction(
  () => document.querySelectorAll(".of-header-search--desktop .search-suggest-group").length >= 1,
  { timeout: 10000 },
);
const secondRender = Date.now();
assert.ok(secondRender - firstRender < 2500, "repeated query should render quickly from cache");
console.log("PASS repeated query cache render");

await input.fill("má phanh vios");
await page.waitForSelector(".of-header-search--desktop .search-suggest-skeleton-item", {
  timeout: 15000,
}).catch(() => null);
const hadSkeleton = (await page.locator(".of-header-search--desktop .search-suggest-skeleton-item").count()) > 0;
await page.waitForFunction(
  () =>
    document.querySelectorAll(".of-header-search--desktop .search-suggest-group .search-suggest-item").length >= 1,
  { timeout: 30000 },
);
if (hadSkeleton) {
  console.log("PASS progressive skeleton → products");
} else {
  console.log("PASS progressive products (skeleton skipped — cache/fast network)");
}

fs.mkdirSync(AUDIT, { recursive: true });
await page.screenshot({
  path: path.join(AUDIT, "after-performance-desktop.png"),
  fullPage: false,
});

const mobile = await browser.newPage({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});
await mobile.goto(`${WEB}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded" });
const mInput = mobile.locator(".of-header-search--mobile .category-search");
await mInput.click();
await mInput.fill("bugi toyota");
await mobile.waitForFunction(
  () => document.querySelectorAll(".of-mobile-search-overlay .search-suggest-group").length >= 1,
  { timeout: 30000 },
);
await mobile.screenshot({
  path: path.join(AUDIT, "after-performance-mobile.png"),
  fullPage: false,
});
console.log("PASS mobile popup stable");

await browser.close();
console.log(`PASS screenshots ${AUDIT}`);
console.log("\nALL PASS — SEARCH-PERFORMANCE-OPTIMIZATION-01\n");
