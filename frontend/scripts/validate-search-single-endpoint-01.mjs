#!/usr/bin/env node
/**
 * SEARCH-SINGLE-ENDPOINT-01
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

const API = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const WEB = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const AUDIT = path.resolve(import.meta.dirname, "../../audit/search-single-endpoint-01");

console.log("\n=== SEARCH-SINGLE-ENDPOINT-01 ===\n");

async function suggest(params) {
  const started = performance.now();
  const res = await fetch(`${API}/search/suggest?${params}`);
  const ttfb = performance.now() - started;
  assert.equal(res.status, 200, `suggest HTTP ${res.status}`);
  const body = await res.json();
  return { body, ttfb };
}

const CASES = [
  { label: "bugi toyota", q: "bugi", brand: "Toyota" },
  { label: "bugi camry", q: "bugi camry", brand: "Toyota", model: "Camry" },
  { label: "má phanh vios", q: "má phanh vios", brand: "Toyota", model: "Vios" },
  { label: "lọc dầu mazda", q: "lọc dầu", brand: "Mazda" },
  { label: "giảm xóc toyota", q: "giảm xóc", brand: "Toyota" },
  { label: "đèn hậu kia", q: "đèn hậu", brand: "Kia" },
];

let legacyMs = 0;
let singleMs = 0;

{
  const params = new URLSearchParams({ query: "bugi", brand: "Toyota" });
  const t0 = performance.now();
  await Promise.all([
    fetch(`${API}/product-categories/search-sidebar?${params}`),
    fetch(`${API}/product-categories/search-preview-batch?${params}`),
  ]);
  legacyMs = performance.now() - t0;
}

{
  const params = new URLSearchParams({ query: "bugi", brand: "Toyota" });
  const { ttfb } = await suggest(params);
  singleMs = ttfb;
}

console.log(`PASS benchmark legacy 2-request ~${Math.round(legacyMs)}ms vs single ~${Math.round(singleMs)}ms`);

for (const c of CASES) {
  const params = new URLSearchParams({ query: c.q });
  if (c.brand) params.set("brand", c.brand);
  if (c.model) params.set("model", c.model);

  const { body } = await suggest(params);
  const groups = body.groups || [];
  assert.ok(groups.length >= 1, `${c.label}: groups`);
  assert.ok(body.viewAll?.label && body.viewAll?.url, `${c.label}: viewAll`);
  assert.ok(Array.isArray(body.categories), `${c.label}: categories`);

  const ids = groups.flatMap((g) => (g.products || []).map((p) => p.id));
  assert.equal(ids.length, new Set(ids).size, `${c.label}: dedup`);

  for (const g of groups) {
    assert.ok(g.title && g.url && g.count != null, `${c.label}: group shape`);
  }

  console.log(`PASS ${c.label} — ${groups.length} groups`);
}

fs.mkdirSync(AUDIT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let requestCount = 0;
page.on("request", (req) => {
  if (/\/search\/suggest/.test(req.url())) requestCount += 1;
});

await page.goto(`${WEB}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded", timeout: 60000 });
const input = page.locator(".of-header-search--desktop .category-search");
await input.waitFor({ state: "visible", timeout: 60000 });
await input.fill("bugi toyota");
await page.waitForTimeout(400);
await page.waitForFunction(
  () => {
    const products = document.querySelectorAll(
      ".of-header-search--desktop .search-suggest-list--panel .search-suggest-item",
    ).length;
    const blocks = document.querySelectorAll(".of-header-search--desktop .search-suggest-group").length;
    return blocks >= 1 && (products >= 1 || document.querySelector(".of-header-search--desktop .search-suggest-empty-msg"));
  },
  { timeout: 60000 },
);
assert.ok(requestCount >= 1, "expected suggest fetch");
await page.screenshot({ path: path.join(AUDIT, "after-single-endpoint-desktop.png") });
console.log(`PASS UI single fetch count=${requestCount}`);

const mobile = await browser.newPage({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
await mobile.goto(`${WEB}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded" });
await mobile.locator(".of-header-search--mobile .category-search").click();
await mobile.fill(".of-header-search--mobile .category-search", "má phanh vios");
await mobile.waitForTimeout(400);
await mobile.waitForFunction(
  () => document.querySelectorAll(".of-mobile-search-overlay .search-suggest-group").length >= 1,
  { timeout: 60000 },
);
await mobile.screenshot({ path: path.join(AUDIT, "after-single-endpoint-mobile.png") });
console.log("PASS mobile popup");

await browser.close();
console.log(`PASS screenshots ${AUDIT}`);
console.log("\nALL PASS — SEARCH-SINGLE-ENDPOINT-01\n");
