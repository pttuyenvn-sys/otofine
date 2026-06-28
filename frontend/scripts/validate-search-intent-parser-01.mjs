#!/usr/bin/env node
/**
 * SEARCH-INTENT-PARSER-01 — parse raw query into structured listing intent.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  mergeSearchIntentWithListingState,
  parseSearchIntent,
  resolveSearchApiKeyword,
} from "../lib/search/parseSearchIntent.js";

const API_BASE = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const WEB_BASE = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

console.log("\n=== SEARCH-INTENT-PARSER-01 ===\n");

async function fetchJson(url) {
  const res = await fetch(url);
  assert.ok(res.ok, `fetch failed ${url} (${res.status})`);
  return res.json();
}

const [brandsBody, hotBody, catsBody] = await Promise.all([
  fetchJson(`${API_BASE}/filter/brands`),
  fetchJson(`${API_BASE}/filter/vehicle-hot`),
  fetchJson(`${API_BASE}/product-categories`).catch(() => []),
]);

const brands = Array.isArray(brandsBody) ? brandsBody : brandsBody?.data || brandsBody?.brands || [];
const modelRows = hotBody?.models || hotBody?.modelRows || [];
const categories = Array.isArray(catsBody) ? catsBody : catsBody?.data || [];
const dict = { brands, modelRows, categories };

const CASES = [
  {
    q: "má phanh vios",
    brand: "Toyota",
    model: "Vios",
    year: "",
    partNumber: "",
    categoryIncludes: "phanh",
  },
  {
    q: "lọc dầu cx5",
    brand: "Mazda",
    model: "CX-5",
    year: "",
    partNumber: "",
    categoryIncludes: "lọc",
  },
  {
    q: "lọc gió altis",
    brand: "Toyota",
    model: "Altis",
    year: "",
    partNumber: "",
    categoryIncludes: "lọc",
  },
  {
    q: "vf5 má phanh",
    brand: "VinFast",
    model: "VF5",
    year: "",
    partNumber: "",
    categoryIncludes: "phanh",
  },
  {
    q: "04465-0D140",
    brand: "",
    model: "",
    year: "",
    partNumber: "04465-0D140",
    categoryIncludes: "",
  },
  {
    q: "gương kia morning 2018",
    brand: "Kia",
    model: "Morning",
    year: "2018",
    partNumber: "",
    remainingKeywords: "gương",
  },
];

for (const c of CASES) {
  const intent = parseSearchIntent(c.q, dict);
  assert.strictEqual(intent.brand, c.brand, `${c.q} brand`);
  assert.strictEqual(intent.model, c.model, `${c.q} model`);
  assert.strictEqual(intent.year, c.year, `${c.q} year`);
  assert.strictEqual(intent.partNumber, c.partNumber, `${c.q} partNumber`);
  if (c.remainingKeywords != null) {
    assert.strictEqual(intent.remainingKeywords, c.remainingKeywords, `${c.q} remaining`);
  }
  if (c.categoryIncludes) {
    assert.ok(
      intent.category.toLowerCase().includes(c.categoryIncludes) ||
        fold(intent.category).includes(fold(c.categoryIncludes)),
      `${c.q} category expected to include ${c.categoryIncludes}, got ${intent.category}`,
    );
  }

  const listing = mergeSearchIntentWithListingState(intent, {
    brand: "",
    model: "",
    year: "",
    category: "",
  });
  const apiQ = resolveSearchApiKeyword(listing, c.q);
  assert.ok(apiQ.length > 0, `${c.q} api keyword must be non-empty`);

  if (intent.brand && intent.model && !intent.partNumber) {
    const inCatalog = modelRows.some(
      (row) =>
        String(row?.brand || "").toLowerCase() === intent.brand.toLowerCase() &&
        String(row?.model || row?.ten_xe || "").toLowerCase() === intent.model.toLowerCase(),
    );
    if (inCatalog) {
      const sidebar = new URLSearchParams({
        q: apiQ,
        brand: listing.brand,
        model: listing.model,
        page: "1",
        limit: "8",
      });
      if (listing.year) sidebar.set("year", listing.year);
      const catRes = await fetch(`${API_BASE}/product-categories/search-sidebar?${sidebar}`);
      assert.ok(catRes.ok, `${c.q} sidebar API`);
      const cats = await catRes.json();
      assert.ok(Array.isArray(cats) && cats.length > 0, `${c.q} expects category suggestions`);
    }
  }
  console.log(`PASS parser + API: ${c.q}`);
}

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${WEB_BASE}/`, { waitUntil: "domcontentloaded" });
const input = page.locator(".of-header-search--desktop .category-search");
await input.waitFor({ timeout: 30000 });
await input.click();
await input.fill("má phanh vios");

await page.waitForFunction(() => {
  const labels = [
    ...document.querySelectorAll(
      ".of-header-search--desktop .search-suggest-cat-row__label",
    ),
  ].map((el) => (el.textContent || "").toLowerCase());
  return labels.some((t) => t.includes("vios"));
}, { timeout: 30000 });

const labels = await page
  .locator(".of-header-search--desktop .search-suggest-cat-row__label")
  .allTextContents();
assert.ok(
  labels.some((t) => /vios/i.test(t)),
  `category labels should include Vios context: ${labels.join(" | ")}`,
);
console.log("PASS UI: má phanh vios shows Vios-scoped category labels");

await browser.close();
console.log("\nALL PASS — SEARCH-INTENT-PARSER-01\n");
