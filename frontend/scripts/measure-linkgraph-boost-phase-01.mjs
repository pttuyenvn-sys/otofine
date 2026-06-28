#!/usr/bin/env node
/**
 * SEO-LINKGRAPH-BOOST-PHASE-01 — HTML crawl-path coverage estimate.
 * Compares sitemap inventory vs links emitted by crawl projection + marketplace sections.
 */
import { projectShopSeoCrawlLinks } from "../lib/shopseo/projectShopSeoCrawlLinks.js";
import { projectShopSeoContextualCrawlLinks } from "../lib/shopseo/projectShopSeoContextualCrawlLinks.js";
import { SHOP_NAMESPACE } from "../lib/shopseo/namespace.js";
import { SHOP_CRAWL_LIMITS } from "../lib/shopseo/projectShopSeoCrawlLinks.shared.js";

const SHOP_SLUG = process.env.LINKGRAPH_SHOP || "phutungoto355";
const API = (process.env.LINKGRAPH_API || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const YEAR_RANGE_NS = new Set([
  SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
  SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
]);

function pct(n, d) {
  if (!d) return "n/a";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function normalizePath(p) {
  return String(p || "")
    .trim()
    .replace(/\/$/, "")
    .toLowerCase();
}

function yearRangePathFromRow(row) {
  const path = String(row.path || "").trim();
  if (path) return normalizePath(path);
  const slug = String(row.slug || "").trim();
  return slug ? normalizePath(`/${slug}`) : "";
}

async function loadShopCatalog(slug) {
  const [catRes, fitRes] = await Promise.all([
    fetch(`${API}/public/shops/${slug}/categories`),
    fetch(`${API}/public/shops/${slug}/fitments`),
  ]);
  const catJson = await catRes.json();
  const fitJson = await fitRes.json();
  const categories = (catJson.items || catJson || []).map((c) => ({
    slug: c.slug || c.name,
    name: c.name,
    productCount: c.productCount,
  }));
  return { categories, fitments: fitJson, vehicleYearRanges: fitJson.vehicleYearRanges || [] };
}

async function loadShopSitemapYearRanges(slug) {
  const xml = await fetch(`http://127.0.0.1:3000/shops/${slug}/sitemap.xml`).then((r) => r.text());
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return locs
    .map((url) => {
      try {
        const u = new URL(url);
        return normalizePath(u.pathname);
      } catch {
        return "";
      }
    })
    .filter((p) => /-\d{4}-\d{4}$/.test(p));
}

function simulateShopYearRangeReach(catalog, sitemapPaths) {
  const vehicleYearRanges = catalog.vehicleYearRanges || [];
  const reachable = new Set();
  const queue = [];

  const home = projectShopSeoCrawlLinks({
    shopBasePath: "",
    categories: catalog.categories,
    fitments: catalog.fitments,
    vehicleYearRanges,
    preset: "full",
  });

  const seedEntity = (row) => ({
    namespace: row.namespace,
    path: row.path,
    filters: row.filters || {},
  });

  for (const section of [home.categories, home.vehicles, home.years]) {
    for (const row of section) {
      queue.push(seedEntity(row));
      if (YEAR_RANGE_NS.has(row.namespace)) {
        reachable.add(normalizePath(row.path));
      }
    }
  }

  const seenPages = new Set(queue.map((e) => normalizePath(e.path)));
  let guard = 0;

  while (queue.length > 0 && guard < 500) {
    guard += 1;
    const entity = queue.shift();
    const ns = entity.namespace;
    if (
      ![
        SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE,
        SHOP_NAMESPACE.SHOP_VEHICLE,
        SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
        SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
        SHOP_NAMESPACE.SHOP_CATEGORY,
        SHOP_NAMESPACE.SHOP_CATEGORY_BRAND,
      ].includes(ns)
    ) {
      continue;
    }

    const { related } = projectShopSeoContextualCrawlLinks({
      shopBasePath: "",
      categories: catalog.categories,
      fitments: catalog.fitments,
      vehicleYearRanges,
      entity,
    });

    for (const link of related) {
      if (YEAR_RANGE_NS.has(link.namespace)) {
        reachable.add(normalizePath(link.path));
      }
      const path = normalizePath(link.path);
      if (!seenPages.has(path)) {
        seenPages.add(path);
        queue.push({
          namespace: link.namespace,
          path: link.path,
          filters: link.filters || {},
        });
      }
    }
  }

  const inSitemap = new Set(sitemapPaths);
  let hit = 0;
  for (const p of inSitemap) {
    if (reachable.has(p)) hit += 1;
  }
  return { total: inSitemap.size, reachable: hit, reachableSet: reachable };
}

async function measureMarketplaceCbmy() {
  const inventory = await fetch(`${API}/seo/sitemap-data`).then((r) => r.json());
  const ranges = inventory.cbmyRangeListings || [];
  const total = ranges.length;

  const linkedRanges = new Set();
  const parentKeys = new Set();

  for (const row of ranges) {
    if (!gateCbmyRange(row)) continue;
    const brand = String(row.brand || "").toLowerCase();
    const model = String(row.model || "").toLowerCase();
    const cat = String(row.categorySlug || "").toLowerCase();
    const key = `${cat}|${brand}|${model}`;
    parentKeys.add(key);
  }

  for (const key of parentKeys) {
    const [cat, brand, model] = key.split("|");
    const matches = ranges.filter(
      (r) =>
        gateCbmyRange(r) &&
        String(r.categorySlug || "").toLowerCase() === cat &&
        String(r.brand || "").toLowerCase() === brand &&
        String(r.model || "").toLowerCase() === model,
    );
    for (const m of matches.slice(0, 12)) {
      linkedRanges.add(String(m.slug || "").toLowerCase());
    }
  }

  return { total, linked: linkedRanges.size, parents: parentKeys.size };
}

function gateCbmyRange(row) {
  return Number(row?.productCount || 0) >= 2;
}

console.log("\n=== SEO-LINKGRAPH-BOOST-PHASE-01 COVERAGE ===\n");

const catalog = await loadShopCatalog(SHOP_SLUG);
const sitemapYearPaths = await loadShopSitemapYearRanges(SHOP_SLUG);
const shop = simulateShopYearRangeReach(catalog, sitemapYearPaths);

console.log(`Shop: ${SHOP_SLUG}`);
console.log(`  SHOP_*_YEAR_RANGE in sitemap: ${shop.total}`);
console.log(`  Reachable via home+contextual projection: ${shop.reachable} (${pct(shop.reachable, shop.total)})`);
console.log(`  Home year cap: ${SHOP_CRAWL_LIMITS.full.years}`);

const cbmy = await measureMarketplaceCbmy();
console.log("\nMarketplace CBMY_RANGE:");
console.log(`  Sitemap inventory: ${cbmy.total}`);
console.log(`  Linked from parent CBM pages (≤12/range group): ${cbmy.linked} (${pct(cbmy.linked, cbmy.total)})`);
console.log(`  Distinct CBM parents with ranges: ${cbmy.parents}`);

console.log("\nBaseline (pre-boost audit): SHOP_YEAR_RANGE 0%, CBMY ~5%");
console.log(`After boost estimate: SHOP ${pct(shop.reachable, shop.total)}, CBMY ${pct(cbmy.linked, cbmy.total)}`);
console.log("");
