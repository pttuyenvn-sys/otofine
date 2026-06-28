#!/usr/bin/env node
/**
 * SEARCH-MULTI-CATEGORY-PREVIEW-01 (superseded by grouped batch — kept for regression)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { buildSuggestViewAllLabel } from "../lib/search/buildSuggestViewAllLabel.js";
import {
  SEARCH_SUGGEST_GROUP_LIMIT,
  SEARCH_SUGGEST_PREVIEW_MAX_TOTAL,
  SEARCH_SUGGEST_PRODUCTS_PER_GROUP,
} from "../lib/search/searchSuggestPreviewConfig.js";

const API = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const WEB = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const AUDIT = path.resolve(import.meta.dirname, "../../audit/search-multi-category-preview-01");

console.log("\n=== SEARCH-MULTI-CATEGORY-PREVIEW-01 ===\n");

assert.equal(SEARCH_SUGGEST_GROUP_LIMIT, 3);
assert.equal(SEARCH_SUGGEST_PRODUCTS_PER_GROUP, 2);
assert.equal(SEARCH_SUGGEST_PREVIEW_MAX_TOTAL, 6);

assert.match(
  buildSuggestViewAllLabel({ brand: "Toyota", model: "", modelAll: true }, "bugi"),
  /Xem tất cả phụ tùng Bugi Toyota/i,
);
console.log("PASS view-all labels");

async function suggest(params) {
  const res = await fetch(`${API}/search/suggest?${params}`);
  assert.equal(res.status, 200);
  return res.json();
}

const CASES = [
  { label: "bugi toyota", q: "bugi", scope: { brand: "Toyota" } },
  { label: "má phanh vios", q: "má phanh vios", scope: { brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", q: "lọc dầu", scope: { brand: "Mazda" } },
  { label: "đèn hậu kia", q: "đèn hậu", scope: { brand: "Kia" } },
];

for (const c of CASES) {
  const params = new URLSearchParams({ query: c.q });
  if (c.scope.brand) params.set("brand", c.scope.brand);
  if (c.scope.model) params.set("model", c.scope.model);

  const body = await suggest(params);
  const groups = body.groups || [];
  assert.ok(groups.length > 0, `${c.label}: expected groups`);
  assert.ok(groups.length <= 3, `${c.label}: max 3 groups`);

  const productTotal = groups.reduce((sum, g) => sum + (g.products?.length || 0), 0);
  assert.ok(productTotal <= 6, `${c.label}: max 6 preview products`);

  const ids = groups.flatMap((g) => g.products.map((p) => p.id));
  assert.equal(ids.length, new Set(ids).size, `${c.label}: no duplicate products`);

  console.log(
    `PASS ${c.label} — ${groups.length} groups, ${productTotal} products (${groups.map((g) => g.title).join(" | ")})`,
  );
}

fs.mkdirSync(AUDIT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${WEB}/phu-tung-toyota-vios`, { waitUntil: "networkidle" });
const input = page.locator(".of-header-search--desktop .category-search");
await input.waitFor({ timeout: 30000 });
await input.click();
await input.fill("má phanh vios");
await page.waitForTimeout(400);
await page.waitForFunction(
  () => document.querySelectorAll(".of-header-search--desktop .search-suggest-group").length >= 1,
  { timeout: 60000 },
);
await page.waitForFunction(
  () =>
    document.querySelectorAll(
      ".of-header-search--desktop .search-suggest-group .search-suggest-item",
    ).length >= 1,
  { timeout: 60000 },
);

const blockCount = await page.locator(".of-header-search--desktop .search-suggest-group").count();
const productCount = await page
  .locator(".of-header-search--desktop .search-suggest-group .search-suggest-item")
  .count();
assert.ok(blockCount >= 1 && blockCount <= 3);
assert.ok(productCount >= 1 && productCount <= 6);

await page.screenshot({
  path: path.join(AUDIT, "after-multi-category-preview-desktop.png"),
  fullPage: false,
});
await browser.close();

console.log(`PASS UI groups=${blockCount} products=${productCount}`);
console.log("\nALL PASS — SEARCH-MULTI-CATEGORY-PREVIEW-01\n");
