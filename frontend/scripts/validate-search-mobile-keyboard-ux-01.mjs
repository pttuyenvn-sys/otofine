#!/usr/bin/env node
/**
 * SEARCH-MOBILE-KEYBOARD-UX-01
 */
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";

const BASE = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

console.log("\n=== SEARCH-MOBILE-KEYBOARD-UX-01 ===\n");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
const input = page.locator(".of-header-search--mobile .category-search");
await input.waitFor({ state: "visible", timeout: 60000 });
await input.click();
await input.fill("giảm");
await page.waitForTimeout(400);

await page.waitForSelector(".of-mobile-search-overlay .search-suggest-list--panel .search-suggest-item", {
  timeout: 60000,
});

const overlay = await page.evaluate(() => ({
  bodyLock: document.body.classList.contains("of-mobile-search-overlay-active"),
  panelOverlay: document
    .querySelector(".of-header-search--mobile")
    ?.classList.contains("of-mobile-search-overlay"),
  bodyOverflow: getComputedStyle(document.body).overflow,
}));
assert.ok(overlay.bodyLock, "body scroll lock class");
assert.ok(overlay.panelOverlay, "mobile search overlay class");
assert.equal(overlay.bodyOverflow, "hidden", "body overflow hidden");
console.log("PASS overlay + body scroll lock");

await page.evaluate(() => {
  const scrollables = document.querySelectorAll(
    ".of-mobile-search-overlay, .search-suggest-panel, .search-suggest-group__products",
  );
  scrollables.forEach((el) => {
    el.scrollTop = 60;
    el.dispatchEvent(new Event("scroll", { bubbles: false }));
  });
  document
    .querySelector(".of-mobile-search-overlay")
    ?.dispatchEvent(new Event("touchmove", { bubbles: true }));
});
await page.waitForTimeout(150);
const activeAfterScroll = await page.evaluate(
  () => document.activeElement?.tagName || "",
);
assert.notEqual(activeAfterScroll, "INPUT", "scroll should blur search input");
console.log("PASS scroll blurs input");

await input.click();
await input.fill("giảm");
await page.waitForTimeout(400);
await page.waitForSelector(".of-mobile-search-overlay .search-suggest-list--panel .search-suggest-item", {
  timeout: 60000,
});
const first = page.locator(".of-mobile-search-overlay .search-suggest-list--panel .search-suggest-item").first();
await first.tap();
await page.waitForTimeout(150);
const activeAfterTap = await page.evaluate(
  () => document.activeElement?.tagName || "",
);
assert.notEqual(activeAfterTap, "INPUT", "result tap should blur input");
console.log("PASS result tap blurs input");

await browser.close();
console.log("\nALL PASS\n");
