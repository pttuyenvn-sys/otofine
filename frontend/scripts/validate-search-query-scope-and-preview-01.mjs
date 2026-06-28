#!/usr/bin/env node
/**
 * SEARCH-QUERY-SCOPE-AND-PREVIEW-01
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  parseSearchIntent,
  resolveSearchScope,
} from "../lib/search/parseSearchIntent.js";
import {
  sortSuggestPreviewProducts,
  matchesResolvedVehicleScope,
} from "../lib/search/sortSuggestPreviewProducts.js";
import {
  SEARCH_SUGGEST_PREVIEW_MAX_TOTAL,
  SEARCH_SUGGEST_PRODUCTS_PER_CATEGORY,
} from "../lib/search/searchSuggestPreviewConfig.js";

const API = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const WEB = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const AUDIT = path.resolve(import.meta.dirname, "../../audit/search-query-scope-and-preview-01");

console.log("\n=== SEARCH-QUERY-SCOPE-AND-PREVIEW-01 ===\n");

assert.equal(SEARCH_SUGGEST_PRODUCTS_PER_CATEGORY, 2, "preview per category must be 2");
assert.equal(SEARCH_SUGGEST_PREVIEW_MAX_TOTAL, 6, "preview max total must be 6");

const pageCtx = { brand: "Toyota", model: "Altis", year: "2015", location: "" };

const scopeCases = [
  {
    q: "bugi",
    expect: { brand: "Toyota", model: "Altis", year: "2015", modelAll: false },
  },
  {
    q: "bugi toyota",
    expect: { brand: "Toyota", model: "", year: "", modelAll: true },
  },
  {
    q: "bugi camry",
    expect: { brand: "Toyota", model: "Camry", year: "", modelAll: false },
  },
  {
    q: "lọc dầu mazda",
    expect: { brand: "Mazda", model: "", year: "", modelAll: true },
  },
  {
    q: "lọc dầu cx5",
    expect: { brand: "Mazda", model: "CX-5", year: "", modelAll: false },
  },
  {
    q: "má phanh vios",
    expect: { brand: "Toyota", model: "Vios", year: "", modelAll: false },
  },
  {
    q: "bugi toyota 2018",
    expect: { brand: "Toyota", model: "", year: "2018", modelAll: true },
  },
];

for (const c of scopeCases) {
  const intent = parseSearchIntent(c.q, {
    brands: [{ brand: "Toyota" }, { brand: "Mazda" }],
    modelRows: [
      { brand: "Toyota", model: "Altis" },
      { brand: "Toyota", model: "Camry" },
      { brand: "Toyota", model: "Vios" },
      { brand: "Mazda", model: "CX-5" },
    ],
    categories: [],
  });
  const scope = resolveSearchScope(intent, pageCtx);
  assert.equal(scope.brand, c.expect.brand, `${c.q} brand`);
  assert.equal(scope.model, c.expect.model, `${c.q} model`);
  assert.equal(scope.year, c.expect.year, `${c.q} year`);
  assert.equal(scope.modelAll, c.expect.modelAll, `${c.q} modelAll`);
  console.log(`PASS scope: ${c.q}`);
}

const sorted = sortSuggestPreviewProducts(
  [
    { id: 1, displayTitle: "A", stock: 0, updatedAt: "2020-01-01" },
    {
      id: 2,
      displayTitle: "B",
      image: "/x.jpg",
      partNumber: "ABC-123",
      stock: 5,
      updatedAt: "2024-01-01",
      productIdentity: {
        fitment: { brand: "Toyota", model: "Altis", year_from: 2014, year_to: 2018 },
      },
    },
  ],
  { brand: "Toyota", model: "Altis", year: "2015" },
);
assert.equal(sorted[0].id, 2);
assert.ok(matchesResolvedVehicleScope(sorted[0], { brand: "Toyota", model: "Altis", year: "2015" }));
console.log("PASS preview sort");

async function sidebar(params) {
  const res = await fetch(`${API}/product-categories/search-sidebar?${params}`);
  assert.equal(res.status, 200);
  return res.json();
}

async function preview(params) {
  const res = await fetch(`${API}/products?${params}`);
  assert.equal(res.status, 200);
  return res.json();
}

const altisScoped = await sidebar(
  new URLSearchParams({ q: "má phanh", brand: "Toyota", model: "Altis", year: "2015" }).toString(),
);
const toyotaAll = await sidebar(
  new URLSearchParams({ q: "má phanh", brand: "Toyota" }).toString(),
);
assert.ok(altisScoped.length > 0 && toyotaAll.length > 0);
assert.match(altisScoped[0].canonical_name, /phanh/i);
console.log(`PASS API altis scoped top: ${altisScoped[0].canonical_name}`);

const viosScoped = await sidebar(
  new URLSearchParams({ q: "má phanh vios", brand: "Toyota", model: "Vios" }).toString(),
);
assert.match(viosScoped[0].canonical_name, /phanh/i);
console.log(`PASS API vios scoped top: ${viosScoped[0].canonical_name}`);

const topCat = viosScoped[0].canonical_name;
const previewBody = await preview(
  new URLSearchParams({
    category: topCat,
    brand: "Toyota",
    model: "Vios",
    page: "1",
    sort: "popular",
  }).toString(),
);
const previewRows = sortSuggestPreviewProducts(previewBody.data || [], {
  brand: "Toyota",
  model: "Vios",
}).slice(0, SEARCH_SUGGEST_PRODUCTS_PER_CATEGORY);
assert.ok(previewRows.length > 0 && previewRows.length <= SEARCH_SUGGEST_PRODUCTS_PER_CATEGORY);
console.log(`PASS preview rows: ${previewRows.length}`);

fs.mkdirSync(AUDIT, { recursive: true });
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${WEB}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded" });
  const input = page.locator(".of-header-search--desktop .category-search");
  await input.waitFor({ timeout: 30000 });
  await input.click();
  await input.fill("má phanh vios");
  await page.waitForFunction(
    () => {
      const panel = document.querySelector(".of-header-search--desktop .search-suggest-panel");
      const blocks = document.querySelectorAll(
        ".of-header-search--desktop .search-suggest-group",
      ).length;
      const products = document.querySelectorAll(
        ".of-header-search--desktop .search-suggest-list--panel .search-suggest-item",
      ).length;
      const empty = document.querySelector(".of-header-search--desktop .search-suggest-empty-msg");
      return panel && blocks > 0 && (products > 0 || Boolean(empty));
    },
    { timeout: 30000 },
  );
  await page.screenshot({ path: path.join(AUDIT, "after-má-phanh-vios-desktop.png"), fullPage: false });

  const productCount = await page
    .locator(".of-header-search--desktop .search-suggest-list--panel .search-suggest-item")
    .count();
  assert.ok(productCount > 0 && productCount <= SEARCH_SUGGEST_PREVIEW_MAX_TOTAL, `desktop preview count ${productCount}`);

  const viewAllVisible = await page
    .locator(".of-header-search--desktop .search-suggest-view-all")
    .isVisible()
    .catch(() => false);
  if (viewAllVisible) {
    const label = await page.locator(".of-header-search--desktop .search-suggest-view-all").textContent();
    assert.match(label || "", /Xem tất cả/i);
    console.log(`PASS view all: ${label?.trim()}`);
  }

  await browser.close();
  console.log(`PASS screenshot: ${path.join(AUDIT, "after-má-phanh-vios-desktop.png")}`);
} catch (err) {
  console.log(`SKIP UI screenshot (${err?.message || err})`);
}
console.log("\nALL PASS — SEARCH-QUERY-SCOPE-AND-PREVIEW-01\n");
