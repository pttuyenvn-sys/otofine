#!/usr/bin/env node
/**
 * SEARCH-SUGGEST-PRODUCT-INTENT-ALIGNMENT-01
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const API_BASE = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const WEB_BASE = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

console.log("\n=== SEARCH-SUGGEST-PRODUCT-INTENT-ALIGNMENT-01 ===\n");

const q = "giảm xóc vios";
const suggestRes = await fetch(
  `${API_BASE}/search/suggest?query=${encodeURIComponent(q)}&brand=Toyota&model=Vios`,
);
const suggestBody = await suggestRes.json();
const groups = suggestBody.groups || [];
assert.ok(groups.length >= 1, "expected grouped suggest response");
const top = groups[0];
assert.match(top.title || "", /giảm/i, "top group should match category intent");
console.log(`Top group: ${top.title}`);

const previewTitles = (top.products || []).map((p) =>
  String(p.displayTitle || p.partName || p.title || "").toLowerCase(),
);
assert.ok(previewTitles.length > 0, "group preview should return products");
assert.ok(
  previewTitles.every((t) => t.includes("giảm") || t.includes("giam")),
  `preview products must match category intent: ${previewTitles.join(" | ")}`,
);
console.log("PASS API category-intent preview scope");

const keywordRes = await fetch(
  `${API_BASE}/products/search?q=${encodeURIComponent(q)}&brand=Toyota&model=Vios&limit=8`,
);
const keywordBody = await keywordRes.json();
const keywordTitles = (keywordBody.data || []).map((r) =>
  String(r.displayTitle || r.partName || "").toLowerCase(),
);
const keywordMismatch = keywordTitles.filter(
  (t) => !t.includes("giảm") && !t.includes("giam"),
).length;
assert.ok(keywordMismatch > 0, "keyword search should include off-intent products for contrast");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(60000);
await page.goto(`${WEB_BASE}/phu-tung-toyota-vios`, { waitUntil: "domcontentloaded", timeout: 60000 });
const input = page.locator(".of-header-search--desktop .category-search");
await input.waitFor({ state: "visible", timeout: 60000 });
await input.fill(q);
await page.waitForTimeout(400);

await page.waitForFunction(() => {
  const titles = [
    ...document.querySelectorAll(
      ".of-header-search--desktop .search-suggest-list--panel .search-suggest-title",
    ),
  ].map((el) => (el.textContent || "").toLowerCase());
  return titles.length > 0 && titles.every((t) => t.includes("giảm") || t.includes("giam"));
}, { timeout: 60000 });

const groupHeading = await page
  .locator(".of-header-search--desktop .search-suggest-group__header")
  .first()
  .textContent();
assert.match(groupHeading || "", /giảm/i, "UI group header should match category intent");
const uiTitles = await page
  .locator(".of-header-search--desktop .search-suggest-list--panel .search-suggest-title")
  .allTextContents();
assert.ok(
  uiTitles.every((t) => t.toLowerCase().includes("giảm") || t.toLowerCase().includes("giam")),
  `UI preview must align with category intent: ${uiTitles.join(" | ")}`,
);
assert.ok(
  !uiTitles.some((t) => /bạc cao su|bac cao su/i.test(t)),
  "UI preview must not show keyword-only mismatches",
);
console.log(`PASS UI group + ${uiTitles.length} aligned preview products`);

await browser.close();
console.log("\nALL PASS\n");
