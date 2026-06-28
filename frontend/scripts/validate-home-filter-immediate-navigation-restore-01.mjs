#!/usr/bin/env node
/**
 * HOME-FILTER-IMMEDIATE-NAVIGATION-RESTORE-01
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

async function stepTiming(page, action, expectPath) {
  const t0 = Date.now();
  await action();
  await page.waitForFunction((p) => location.pathname === p, expectPath, {
    timeout: 15000,
  });
  await page.waitForSelector(".of-product", { timeout: 15000 });
  const path = await page.evaluate(() => location.pathname);
  const h1 = await page.evaluate(() =>
    document.querySelector(".listing-hero__title, h1")?.textContent?.trim(),
  );
  return { ms: Date.now() - t0, path, h1 };
}

console.log("\n=== HOME-FILTER-IMMEDIATE-NAVIGATION-RESTORE-01 ===\n");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".vehicle-chip--brand", { timeout: 30000 });

assert.ok(
  !(await page.locator('.vehicle-quick-actions .search-btn', { hasText: "Áp dụng" }).count()),
  "Apply button removed",
);

const brand = await stepTiming(
  page,
  () => page.locator(".vehicle-chip--brand", { hasText: "Toyota" }).first().click(),
  "/phu-tung-toyota",
);
assert.match(brand.h1 || "", /Toyota/i);
console.log(`PASS brand pick ${brand.ms}ms → ${brand.path}`);

const model = await stepTiming(
  page,
  () => page.locator(".vehicle-chip--model", { hasText: "Vios" }).first().click(),
  "/phu-tung-toyota-vios",
);
assert.match(model.h1 || "", /Vios/i);
console.log(`PASS model pick ${model.ms}ms → ${model.path}`);

const year = await stepTiming(
  page,
  () => page.locator(".vehicle-chip--year", { hasText: "2020" }).first().click(),
  "/phu-tung-toyota-vios-2020",
);
assert.match(year.h1 || "", /2020/);
console.log(`PASS year pick ${year.ms}ms → ${year.path}`);

await browser.close();

console.log(
  JSON.stringify(
    {
      perStepMs: { brand: brand.ms, model: model.ms, year: year.ms },
      totalMs: brand.ms + model.ms + year.ms,
    },
    null,
    2,
  ),
);
console.log("\nALL PASS\n");
