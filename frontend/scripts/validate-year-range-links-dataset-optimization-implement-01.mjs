#!/usr/bin/env node
/**
 * YEAR-RANGE-LINKS-DATASET-OPTIMIZATION-IMPLEMENT-01
 * Parity + payload/latency checks for GET /api/seo/year-range-links
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { slugifyVi } from "../lib/seo/slugify.js";

const require = createRequire(import.meta.url);
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildListingIdentity } = require(
  path.join(frontendRoot, "components/pages/home/services/listingSeoState.js"),
);
const { buildListingUrlFromIdentity } = require(
  path.join(frontendRoot, "components/pages/home/services/listingUrlState.js"),
);

const LISTING_YEAR_RANGE_LIMITS = Object.freeze({
  cbm: 24,
  bmy: 24,
  rangeSiblings: 24,
});

const API = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");

function gateVehicleYearRangeEntry(metrics = {}) {
  return Number(metrics.productCount) >= 10;
}

function gateCategoryBrandVehicleYearRangeEntry(metrics = {}) {
  return Number(metrics.productCount) >= 2;
}

function buildVehicleOwnerPath({ brand, model, year } = {}) {
  const identity = buildListingIdentity({
    categoryName: "",
    hasCategory: false,
    brand,
    model,
    year,
    location: "",
  });
  return buildListingUrlFromIdentity(identity);
}

function buildCategoryOwnerPathFromState({
  categoryName,
  brand,
  model,
  year,
  canonicalSlug,
} = {}) {
  const identity = buildListingIdentity({
    categoryName,
    hasCategory: Boolean(categoryName),
    brand,
    model,
    year,
    location: "",
    categoryCanonicalSlug: canonicalSlug,
  });
  return buildListingUrlFromIdentity(identity);
}

const BMY_FIELDS = ["slug", "brand", "model", "yearFrom", "yearTo", "productCount"];
const CBMY_FIELDS = [
  "slug",
  "categorySlug",
  "brand",
  "model",
  "yearFrom",
  "yearTo",
  "productCount",
];

function slimRows(rows, fields) {
  return (rows || []).map((row) =>
    Object.fromEntries(fields.map((f) => [f, row[f]])),
  );
}

function stableJson(rows, fields) {
  const slim = slimRows(rows, fields);
  slim.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  return JSON.stringify(slim);
}

function categoryCoreFromSlug(canonicalSlug) {
  const cs = String(canonicalSlug || "")
    .trim()
    .toLowerCase();
  if (!cs) return "";
  return cs.endsWith("-o-to") ? cs.slice(0, -"-o-to".length) : cs;
}

function matchSlug(a, b) {
  return slugifyVi(String(a || "")) === slugifyVi(String(b || ""));
}

function cbmyRangeLink(row) {
  const slug = String(row?.slug || "").trim();
  if (!slug) return null;
  return { href: `/${slug}`, label: `${row.yearFrom}–${row.yearTo}` };
}

function bmyRangeLink(row) {
  const slug = String(row?.slug || "").trim();
  if (!slug) return null;
  return { href: `/${slug}`, label: `${row.yearFrom}–${row.yearTo}` };
}

function filterCbmyRanges(rows, ctx) {
  const catCore = categoryCoreFromSlug(ctx.categorySlug);
  return (rows || [])
    .filter((row) => {
      if (!gateCategoryBrandVehicleYearRangeEntry({ productCount: row.productCount })) {
        return false;
      }
      if (String(row.categorySlug || "").toLowerCase() !== catCore) return false;
      if (!matchSlug(row.brand, ctx.brand)) return false;
      if (!matchSlug(row.model, ctx.model)) return false;
      const range = `${row.yearFrom}-${row.yearTo}`;
      if (ctx.excludeYear && range === ctx.excludeYear) return false;
      return true;
    })
    .map(cbmyRangeLink)
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));
}

function filterBmyRanges(rows, ctx) {
  return (rows || [])
    .filter((row) => {
      if (!gateVehicleYearRangeEntry({ productCount: row.productCount })) {
        return false;
      }
      if (!matchSlug(row.brand, ctx.brand)) return false;
      if (!matchSlug(row.model, ctx.model)) return false;
      const range = `${row.yearFrom}-${row.yearTo}`;
      if (ctx.excludeYear && range === ctx.excludeYear) return false;
      return true;
    })
    .map(bmyRangeLink)
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));
}

function parentCbmyLink(meta) {
  const href = buildCategoryOwnerPathFromState({
    categoryName: meta.canonicalName || meta.categoryName || "",
    brand: meta.cbmBrand || "",
    model: meta.cbmModel || "",
    year: "",
    canonicalSlug: meta.canonicalSlug || "",
  });
  if (!href || href === "/") return null;
  const brand = String(meta.cbmBrand || "").trim();
  const model = String(meta.cbmModel || "").trim();
  const label = [brand, model].filter(Boolean).join(" ") || "Tất cả đời xe";
  return { href, label: `Tất cả đời xe — ${label}` };
}

function parentBmyLink(brand, model) {
  const href = buildVehicleOwnerPath({ brand, model, year: "" });
  if (!href || href === "/") return null;
  const label = [brand, model].filter(Boolean).join(" ") || "Tất cả đời xe";
  return { href, label: `Tất cả đời xe — ${label}` };
}

function withOptionalParent(links, parent, max) {
  const list = parent ? [parent, ...links] : links;
  return list.slice(0, parent ? max + 1 : max);
}

function resolveBmySection(inventory, brand, model, year) {
  const isRangePage = String(year || "").includes("-");
  const siblingLinks = filterBmyRanges(inventory.bmyRangeListings, {
    brand,
    model,
    excludeYear: isRangePage ? year : undefined,
  });
  const parent = isRangePage ? parentBmyLink(brand, model) : null;
  const links = withOptionalParent(
    siblingLinks,
    parent,
    isRangePage ? LISTING_YEAR_RANGE_LIMITS.rangeSiblings : LISTING_YEAR_RANGE_LIMITS.bmy,
  );
  if (!links.length) return null;
  return {
    title: isRangePage ? "Các đời xe khác" : "Đời xe",
    links,
  };
}

function resolveCbmySection(inventory, meta) {
  const brand = String(meta.cbmBrand || "").trim();
  const model = String(meta.cbmModel || "").trim();
  const year = String(meta.cbmYear || "").trim();
  const categorySlug = meta.canonicalSlug || meta.categorySlug || "";
  if (!brand || !model || meta.cbmLocation) return null;

  const isRangePage = year.includes("-");
  const siblingLinks = filterCbmyRanges(inventory.cbmyRangeListings, {
    categorySlug,
    brand,
    model,
    excludeYear: isRangePage ? year : undefined,
  });
  const parent = isRangePage ? parentCbmyLink(meta) : null;
  const links = withOptionalParent(
    siblingLinks,
    parent,
    isRangePage ? LISTING_YEAR_RANGE_LIMITS.rangeSiblings : LISTING_YEAR_RANGE_LIMITS.cbm,
  );
  if (!links.length) return null;
  return {
    title: isRangePage ? "Các đời xe khác" : "Các đời xe phù hợp",
    links,
  };
}

console.log("\n=== YEAR-RANGE-LINKS-DATASET-OPTIMIZATION-IMPLEMENT-01 ===\n");

const t0 = performance.now();
const sitemapRes = await fetch(`${API}/seo/sitemap-data`);
const sitemapText = await sitemapRes.text();
const tSitemapFetch = performance.now();
const sitemap = JSON.parse(sitemapText);
const tSitemapParse = performance.now();

const t1 = performance.now();
const yearRes = await fetch(`${API}/seo/year-range-links`);
const yearText = await yearRes.text();
const tYearFetch = performance.now();
const yearLinks = JSON.parse(yearText);
const tYearParse = performance.now();

assert.equal(sitemapRes.status, 200, "sitemap-data HTTP");
assert.equal(yearRes.status, 200, "year-range-links HTTP");
assert.equal(
  yearRes.headers.get("cache-control")?.includes("max-age=3600"),
  true,
  "Cache-Control max-age=3600",
);

const sitemapBytes = Buffer.byteLength(sitemapText);
const yearBytes = Buffer.byteLength(yearText);

const beforeBmy = stableJson(sitemap.bmyRangeListings, BMY_FIELDS);
const afterBmy = stableJson(yearLinks.bmyRangeListings, BMY_FIELDS);
const gatedCbmyFromSitemap = (sitemap.cbmyRangeListings || []).filter(
  (row) => gateCategoryBrandVehicleYearRangeEntry({ productCount: row.productCount }),
);
const beforeCbmy = stableJson(gatedCbmyFromSitemap, CBMY_FIELDS);
const afterCbmy = stableJson(yearLinks.cbmyRangeListings, CBMY_FIELDS);

assert.equal(afterBmy, beforeBmy, "bmyRangeListings slim parity");
assert.equal(afterCbmy, beforeCbmy, "cbmyRangeListings slim parity (gated rows)");
console.log("PASS inventory row parity (slim fields, link-eligible CBMY)");

const cases = [
  {
    name: "BMY Toyota Vios",
    run: (inv) => resolveBmySection(inv, "Toyota", "Vios", ""),
  },
  {
    name: "BMY_RANGE Toyota Vios 2014-2020",
    run: (inv) => resolveBmySection(inv, "Toyota", "Vios", "2014-2020"),
  },
  {
    name: "CBMY ma-phanh Toyota Vios",
    run: (inv) =>
      resolveCbmySection(inv, {
        canonicalName: "Má phanh",
        canonicalSlug: "ma-phanh-o-to",
        cbmBrand: "Toyota",
        cbmModel: "Vios",
        cbmYear: "",
      }),
  },
  {
    name: "CBMY_RANGE ma-phanh Toyota Vios 2014-2020",
    run: (inv) =>
      resolveCbmySection(inv, {
        canonicalName: "Má phanh",
        canonicalSlug: "ma-phanh-o-to",
        cbmBrand: "Toyota",
        cbmModel: "Vios",
        cbmYear: "2014-2020",
      }),
  },
];

for (const c of cases) {
  const fromSitemap = c.run({
    bmyRangeListings: sitemap.bmyRangeListings,
    cbmyRangeListings: sitemap.cbmyRangeListings,
  });
  const fromYear = c.run(yearLinks);
  assert.deepEqual(fromYear, fromSitemap, `${c.name} link section parity`);
  console.log(`PASS ${c.name} (${fromYear?.links?.length ?? 0} links)`);
}

assert.ok(yearBytes < 150 * 1024, `payload ${yearBytes}B must be <150KB`);
assert.ok(tYearParse - tYearFetch < 5, `parse ${(tYearParse - tYearFetch).toFixed(2)}ms must be <5ms`);

const heapBefore = process.memoryUsage().heapUsed;
JSON.parse(yearText);
const heapAfter = process.memoryUsage().heapUsed;

console.log("\n--- Metrics ---");
console.log(
  JSON.stringify(
    {
      payload: {
        sitemapDataBytes: sitemapBytes,
        yearRangeLinksBytes: yearBytes,
        reductionPct: ((1 - yearBytes / sitemapBytes) * 100).toFixed(1) + "%",
        under150KB: yearBytes < 150 * 1024,
      },
      latencyMs: {
        sitemapFetch: (tSitemapFetch - t0).toFixed(1),
        sitemapParse: (tSitemapParse - tSitemapFetch).toFixed(1),
        yearRangeFetch: (tYearFetch - t1).toFixed(1),
        yearRangeParse: (tYearParse - tYearFetch).toFixed(1),
      },
      heapParseDeltaKB: ((heapAfter - heapBefore) / 1024).toFixed(1),
      counts: {
        bmy: yearLinks.bmyRangeListings?.length,
        cbmy: yearLinks.cbmyRangeListings?.length,
      },
    },
    null,
    2,
  ),
);

console.log("\nALL PASS\n");
