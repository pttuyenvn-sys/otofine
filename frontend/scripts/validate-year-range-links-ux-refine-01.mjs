#!/usr/bin/env node
/**
 * YEAR-RANGE-LINKS-UX-REFINE-01 — link parity + UX checks
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const auditDir = path.resolve(__dirname, "../../audit/screenshots/year-range-links-ux-refine-01");

function extractYearRangeLinks(html) {
  const navMatch = html.match(
    /<nav[^>]*class="listing-year-range-links"[^>]*>[\s\S]*?<\/nav>/i,
  );
  if (!navMatch) return { title: null, hrefs: [] };
  const block = navMatch[0];
  const titleMatch = block.match(
    /<h2[^>]*class="listing-year-range-links__title"[^>]*>([^<]+)</i,
  );
  const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    hrefs,
  };
}

function productAnchorIndex(html) {
  return html.indexOf('id="otofine-products-start"');
}

function yearRangeNavIndex(html) {
  return html.indexOf('class="listing-year-range-links"');
}

async function fetchHtml(urlPath) {
  const res = await fetch(`${BASE}${urlPath}`, { redirect: "follow" });
  assert.equal(res.status, 200, `${urlPath} HTTP ${res.status}`);
  return res.text();
}

console.log("\n=== YEAR-RANGE-LINKS-UX-REFINE-01 ===\n");

const paths = [
  "/phu-tung-toyota-vios",
  "/phu-tung-toyota-vios-2015",
  "/phu-tung-toyota-vios-2014-2020",
  "/ma-phanh-toyota-vios",
];

const snapshots = {};
for (const p of paths) {
  const html = await fetchHtml(p);
  const section = extractYearRangeLinks(html);
  snapshots[p] = section;
  assert.ok(section.hrefs.length > 0, `${p} should expose year-range links`);
  assert.ok(
    productAnchorIndex(html) < yearRangeNavIndex(html),
    `${p} year-range section must appear after product anchor`,
  );
  console.log(`PASS ${p} — ${section.hrefs.length} links, title="${section.title}"`);
}

assert.equal(
  snapshots["/phu-tung-toyota-vios"].hrefs.length,
  snapshots["/phu-tung-toyota-vios-2015"].hrefs.length,
  "BMY link count parity across single-year page",
);

const viosHrefs = new Set(snapshots["/phu-tung-toyota-vios"].hrefs);
for (const href of snapshots["/phu-tung-toyota-vios-2015"].hrefs) {
  assert.ok(viosHrefs.has(href), `missing href on 2015 page: ${href}`);
}
console.log("PASS link parity Toyota Vios vs Toyota Vios 2015");

assert.match(
  snapshots["/phu-tung-toyota-vios-2015"].title || "",
  /Các đời Toyota Vios khác/i,
  "dynamic title for single-year BMY",
);
assert.match(
  snapshots["/phu-tung-toyota-vios-2014-2020"].title || "",
  /Các đời Toyota Vios khác/i,
  "dynamic title for range BMY",
);
console.log("PASS dynamic titles");

await mkdir(auditDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}/phu-tung-toyota-vios-2015`, { waitUntil: "networkidle" });
await page.waitForSelector(".listing-year-range-links", { timeout: 30000 });
await page.screenshot({
  path: path.join(auditDir, "after-toyota-vios-2015.png"),
  fullPage: true,
});
await browser.close();
console.log(`PASS screenshot → ${path.join(auditDir, "after-toyota-vios-2015.png")}`);

console.log(
  JSON.stringify(
    {
      linkCounts: Object.fromEntries(
        Object.entries(snapshots).map(([k, v]) => [k, v.hrefs.length]),
      ),
      titles: Object.fromEntries(
        Object.entries(snapshots).map(([k, v]) => [k, v.title]),
      ),
    },
    null,
    2,
  ),
);
console.log("\nALL PASS\n");
