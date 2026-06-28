#!/usr/bin/env node
/**
 * SEARCH-UX-REFINEMENT-01
 */
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { buildSearchHighlightParts } from "../lib/search/highlightSearchQuery.js";
import { SEARCH_SUGGEST_PREVIEW_MAX_TOTAL } from "../lib/search/searchSuggestPreviewConfig.js";

const WEB_BASE = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

console.log("\n=== SEARCH-UX-REFINEMENT-01 ===\n");

const parts = buildSearchHighlightParts(
  "Giảm xóc trước phải Toyota Vios",
  "giảm xóc vios",
);
assert.ok(parts.some((p) => p.highlight && /giảm/i.test(p.text)));
assert.ok(parts.some((p) => p.highlight && /vios/i.test(p.text)));
assert.ok(parts.every((p) => !/[<>]/.test(p.text)));
console.log("PASS highlight tokens");

const KEYWORDS = ["giảm xóc vios", "lọc dầu", "má phanh", "càng a"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

for (const keyword of KEYWORDS) {
  await page.goto(`${WEB_BASE}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const input = page.locator(".of-header-search--desktop .category-search");
  await input.waitFor({ timeout: 30000 });
  await input.click();
  await input.fill("");
  await input.fill(keyword);
  await page.waitForTimeout(400);

  await page.waitForFunction(
    () => {
      const panel = document.querySelector(".of-header-search--desktop .search-suggest-panel");
      if (!panel) return false;
      const products = document.querySelectorAll(
        ".of-header-search--desktop .search-suggest-list--panel .search-suggest-item",
      ).length;
      const empty = document.querySelector(
        ".of-header-search--desktop .search-suggest-empty-msg",
      );
      const blocks = document.querySelectorAll(
        ".of-header-search--desktop .search-suggest-group",
      ).length;
      if (blocks === 0) return products > 0;
      return products > 0 || Boolean(empty);
    },
    { timeout: 60000 },
  );

  const blockCount = await page
    .locator(".of-header-search--desktop .search-suggest-group")
    .count();

  if (blockCount > 0) {
    const highlightCount = await page
      .locator(".of-header-search--desktop .search-suggest-highlight")
      .count();
    assert.ok(highlightCount > 0, `${keyword}: expected highlighted tokens`);
  }

  const productCount = await page
    .locator(".of-header-search--desktop .search-suggest-list--panel .search-suggest-item")
    .count();
  if (productCount > 0) {
    assert.ok(
      productCount <= SEARCH_SUGGEST_PREVIEW_MAX_TOTAL,
      `${keyword}: preview max ${SEARCH_SUGGEST_PREVIEW_MAX_TOTAL}, got ${productCount}`,
    );
    const marksOnProducts = await page
      .locator(".of-header-search--desktop .search-suggest-list--panel .search-suggest-highlight")
      .count();
    assert.ok(marksOnProducts > 0, `${keyword}: product titles highlighted`);
  }

  console.log(`PASS keyword "${keyword}" (blocks=${blockCount}, products=${productCount})`);
}

await page.goto(`${WEB_BASE}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded" });
const input = page.locator(".of-header-search--desktop .category-search");
await input.fill("giảm xóc vios");
await page.waitForSelector(".of-header-search--desktop .search-suggest-view-all", {
  timeout: 5000,
}).catch(() => null);

const viewAllVisible = await page
  .locator(".of-header-search--desktop .search-suggest-view-all")
  .isVisible()
  .catch(() => false);

if (viewAllVisible) {
  const label = await page.locator(".of-header-search--desktop .search-suggest-view-all").textContent();
  assert.match(label || "", /Xem tất cả/i);
  await page.locator(".of-header-search--desktop .search-suggest-view-all").click();
  await page.waitForTimeout(400);
  const path = new URL(page.url()).pathname;
  assert.ok(path.includes("toyota") && path.includes("vios"));
  console.log(`PASS view all navigates to ${path}`);
} else {
  console.log("SKIP view all (total <= 3 for giảm xóc vios)");
}

const mobile = await browser.newPage({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});
await mobile.goto(`${WEB_BASE}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded", timeout: 60000 });
const mInput = mobile.locator(".of-header-search--mobile .category-search");
await mInput.click();
await mInput.fill("càng a");
await mobile.waitForTimeout(400);
await mobile.waitForFunction(
  () => document.querySelectorAll(".of-mobile-search-overlay .search-suggest-group").length >= 1,
  { timeout: 60000 },
);
const rowHeight = await mobile
  .locator(".of-mobile-search-overlay .search-suggest-group__header")
  .first()
  .evaluate((el) => el.getBoundingClientRect().height);
assert.ok(rowHeight >= 44 && rowHeight <= 52, `mobile row height ${rowHeight}px`);
console.log(`PASS mobile tap height ${Math.round(rowHeight)}px`);

await browser.close();
console.log("\nALL PASS\n");
