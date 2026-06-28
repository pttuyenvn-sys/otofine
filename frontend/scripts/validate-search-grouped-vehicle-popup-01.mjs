#!/usr/bin/env node
/**
 * SEARCH-GROUPED-VEHICLE-POPUP-01
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";
import { buildSuggestViewAllLabel } from "../lib/search/buildSuggestViewAllLabel.js";
import {
  SEARCH_SUGGEST_GROUP_LIMIT,
  SEARCH_SUGGEST_PREVIEW_MAX_TOTAL,
  SEARCH_SUGGEST_PRODUCTS_PER_GROUP,
} from "../lib/search/searchSuggestPreviewConfig.js";

const API = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const WEB = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const AUDIT = path.resolve(import.meta.dirname, "../../audit/search-grouped-vehicle-popup-01");

console.log("\n=== SEARCH-GROUPED-VEHICLE-POPUP-01 ===\n");

assert.equal(SEARCH_SUGGEST_GROUP_LIMIT, 3);
assert.equal(SEARCH_SUGGEST_PRODUCTS_PER_GROUP, 2);
assert.equal(SEARCH_SUGGEST_PREVIEW_MAX_TOTAL, 6);

async function batch(params) {
  const res = await fetch(`${API}/search/suggest?${params}`);
  assert.equal(res.status, 200, `suggest HTTP ${res.status}`);
  return res.json();
}

function collectProductIds(blocks) {
  return blocks.flatMap((b) => (b.products || []).map((p) => p.id));
}

const CASES = [
  { label: "bugi toyota", q: "bugi", brand: "Toyota" },
  { label: "bugi camry", q: "bugi camry", brand: "Toyota", model: "Camry" },
  { label: "má phanh vios", q: "má phanh vios", brand: "Toyota", model: "Vios" },
  { label: "giảm xóc toyota", q: "giảm xóc", brand: "Toyota" },
  { label: "lọc dầu mazda", q: "lọc dầu", brand: "Mazda" },
  { label: "đèn hậu kia", q: "đèn hậu", brand: "Kia" },
];

for (const c of CASES) {
  const params = new URLSearchParams({ query: c.q });
  if (c.brand) params.set("brand", c.brand);
  if (c.model) params.set("model", c.model);

  const body = await batch(params);
  assert.ok(Array.isArray(body.groups), `${c.label}: groups array`);
  const groups = body.groups;
  assert.ok(groups.length <= 3, `${c.label}: max 3 groups`);

  const ids = collectProductIds(groups);
  assert.equal(ids.length, new Set(ids).size, `${c.label}: no duplicate products`);
  assert.ok(ids.length <= 6, `${c.label}: max 6 products`);

  for (const group of groups) {
    assert.ok(group.title, `${c.label}: group title`);
    assert.ok(group.canonical_name, `${c.label}: canonical_name`);
    assert.ok(group.url, `${c.label}: group url`);
    assert.ok(group.products.length <= 2, `${c.label}: max 2 per group`);
    assert.equal(
      group.count >= group.products.length,
      true,
      `${c.label}: count >= preview size for ${group.title}`,
    );
  }

  assert.ok(body.viewAll?.label, `${c.label}: viewAll label`);
  assert.ok(body.viewAll?.url, `${c.label}: viewAll url`);

  console.log(
    `PASS ${c.label} — ${groups.length} groups, ${ids.length} products (${groups.map((g) => g.title).join(" | ")})`,
  );
}

assert.match(
  buildSuggestViewAllLabel({ brand: "Toyota", model: "", modelAll: true }, "bugi"),
  /Xem tất cả phụ tùng Bugi Toyota/i,
);
console.log("PASS view-all label");

fs.mkdirSync(AUDIT, { recursive: true });
const browser = await chromium.launch({ headless: true });

const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await desktop.goto(`${WEB}/phu-tung-toyota-vios`, { waitUntil: "networkidle" });
const dInput = desktop.locator(".of-header-search--desktop .category-search");
await dInput.waitFor({ timeout: 30000 });
await dInput.click();
await dInput.fill("má phanh vios");
await desktop.waitForTimeout(400);
await desktop.waitForFunction(
  () =>
    document.querySelectorAll(".of-header-search--desktop .search-suggest-group").length >= 1,
  { timeout: 60000 },
);
await desktop.waitForFunction(
  () =>
    document.querySelectorAll(
      ".of-header-search--desktop .search-suggest-group .search-suggest-item",
    ).length >= 1,
  { timeout: 60000 },
);
const dGroups = await desktop.locator(".of-header-search--desktop .search-suggest-group").count();
const dProducts = await desktop
  .locator(".of-header-search--desktop .search-suggest-group .search-suggest-item")
  .count();
assert.ok(dGroups >= 1 && dGroups <= 3);
assert.ok(dProducts >= 1 && dProducts <= 6);

const panelMaxHeight = await desktop
  .locator(".of-header-search--desktop .search-suggest-panel")
  .evaluate((el) => parseFloat(getComputedStyle(el).maxHeight));
assert.ok(panelMaxHeight <= 650, `desktop max-height ${panelMaxHeight}px`);

await desktop.screenshot({
  path: path.join(AUDIT, "after-grouped-popup-desktop.png"),
  fullPage: false,
});
console.log(`PASS desktop UI groups=${dGroups} products=${dProducts}`);

const mobile = await browser.newPage({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});
await mobile.goto(`${WEB}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded" });
const mInput = mobile.locator(".of-header-search--mobile .category-search");
await mInput.click();
await mInput.fill("bugi toyota");
await mobile.waitForFunction(
  () =>
    document.querySelectorAll(".of-mobile-search-overlay .search-suggest-group").length >= 1,
  { timeout: 30000 },
);
const mPanelMax = await mobile
  .locator(".of-mobile-search-overlay .search-suggest-panel")
  .evaluate((el) => {
    const px = parseFloat(getComputedStyle(el).maxHeight);
    const vh = window.innerHeight * 0.7;
    return { px, vh };
  });
assert.ok(mPanelMax.px <= mPanelMax.vh + 2, `mobile max-height ${mPanelMax.px}px`);
await mobile.screenshot({
  path: path.join(AUDIT, "after-grouped-popup-mobile.png"),
  fullPage: false,
});
console.log("PASS mobile UI + scroll height");

await browser.close();
console.log(`PASS screenshots in ${AUDIT}`);
console.log("\nALL PASS — SEARCH-GROUPED-VEHICLE-POPUP-01\n");
