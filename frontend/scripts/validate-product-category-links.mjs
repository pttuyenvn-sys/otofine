#!/usr/bin/env node
/**
 * ARCH-05C.2A.2 — validate product → category links.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildPageTitle } = require(
  path.join(frontendRoot, "components/pages/home/services/listingSeoState.js"),
);
const { buildListingIdentity } = require(
  path.join(frontendRoot, "components/pages/home/services/listingSeoState.js"),
);
const { buildListingUrlFromIdentity } = require(
  path.join(frontendRoot, "components/pages/home/services/listingUrlState.js"),
);

const API_BASE = process.env.API_BASE || "http://localhost:5000/api";
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const productId = args.product || "218";
const sampleSize = Number(args.sample || 0) || 0;
const extraIds = String(args.extra || "108,110,109,111,112,113,114,115,116,117")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

function buildCategoryOwnerPathFromState({ categoryName } = {}) {
  const identity = buildListingIdentity({
    categoryName: String(categoryName || "").trim(),
    hasCategory: Boolean(String(categoryName || "").trim()),
    brand: "",
    model: "",
    year: "",
    location: "",
  });
  return buildListingUrlFromIdentity(identity);
}

function readCategoryFields(row) {
  if (!row || typeof row !== "object") return { categoryName: "" };
  const categoryName = String(
    row.canonicalName ??
      row.canonical_name ??
      row.categoryName ??
      row.category_name ??
      "",
  ).trim();
  return { categoryName };
}

function buildProductCategoryLinks(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return [];
  const byHref = new Map();
  for (const row of categories) {
    const { categoryName } = readCategoryFields(row);
    if (!categoryName) continue;
    const href = buildCategoryOwnerPathFromState({ categoryName });
    const label = buildPageTitle({ categoryName, hasCategory: true });
    if (!href || href === "/" || !label || byHref.has(href)) continue;
    byHref.set(href, { href, label, categoryName });
  }
  return [...byHref.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "vi"),
  );
}

async function fetchProduct(id) {
  const res = await fetch(`${API_BASE}/product/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`product ${id}: HTTP ${res.status}`);
  return res.json();
}

async function fetchProductIds(limit) {
  const res = await fetch(`${API_BASE}/seo/sitemap-data`);
  if (!res.ok) throw new Error(`sitemap-data: HTTP ${res.status}`);
  const json = await res.json();
  return (json.products || [])
    .map((p) => p?.id ?? p?.productId)
    .filter((id) => id != null && Number(id) > 0)
    .slice(0, limit);
}

function printProductRow(id, payload) {
  const links = buildProductCategoryLinks(payload?.categories || []);
  for (const link of links) {
    console.log(`| ${id} | ${link.categoryName} | ${link.href} |`);
  }
  if (links.length === 0) {
    console.log(`| ${id} | — | — |`);
  }
  return links;
}

async function main() {
  const validationIds = [
    productId,
    ...extraIds.filter((id) => id !== productId),
  ].slice(0, 11);

  console.log("=== Phase 5 — Validation ===");
  console.log("| Product | Category | URL |");
  console.log("| ------- | -------- | --- |");

  for (const id of validationIds) {
    const payload = await fetchProduct(id);
    printProductRow(id, payload);
  }

  if (sampleSize > 0) {
    const ids = await fetchProductIds(sampleSize);
    let withCategories = 0;
    let categoryLinks = 0;
    const unique = new Set();
    /** @type {Map<string, number>} */
    const categoryCounts = new Map();

    for (const id of ids) {
      try {
        const payload = await fetchProduct(id);
        const cats = payload?.categories || [];
        if (cats.length > 0) withCategories += 1;
        const links = buildProductCategoryLinks(cats);
        categoryLinks += links.length;
        for (const link of links) {
          unique.add(link.href);
          categoryCounts.set(
            link.categoryName,
            (categoryCounts.get(link.categoryName) || 0) + 1,
          );
        }
      } catch (e) {
        console.error(`skip ${id}:`, e.message);
      }
    }

    console.log("\n=== Phase 6 — Coverage Report ===");
    console.log("| Metric | Count |");
    console.log("| ------ | ----: |");
    console.log(`| Products audited | ${ids.length} |`);
    console.log(`| Products with categories | ${withCategories} |`);
    console.log(`| Category links emitted | ${categoryLinks} |`);
    console.log(`| Unique category URLs linked | ${unique.size} |`);

    console.log("\nTop 50 linked categories:");
    console.log("| Category | Products |");
    console.log("| -------- | -------: |");
    [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"))
      .slice(0, 50)
      .forEach(([name, count]) => {
        console.log(`| ${name} | ${count} |`);
      });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
