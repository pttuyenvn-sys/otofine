#!/usr/bin/env node
/**
 * SEO-LINKGRAPH-BOOST-PHASE-02 — HTML crawl-path coverage estimate.
 */
import { projectShopSeoCrawlLinks } from "../lib/shopseo/projectShopSeoCrawlLinks.js";
import { projectShopSeoContextualCrawlLinks } from "../lib/shopseo/projectShopSeoContextualCrawlLinks.js";
import { SHOP_NAMESPACE } from "../lib/shopseo/namespace.js";
import { SHOP_CRAWL_LIMITS } from "../lib/shopseo/projectShopSeoCrawlLinks.shared.js";

const SHOP_SLUG = process.env.LINKGRAPH_SHOP || "phutungoto355";
const API = (process.env.LINKGRAPH_API || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const CBMY_LINK_CAP = 24;
const YEAR_RANGE_NS = new Set([
  SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
  SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
]);

const PHASE01_SHOP_PCT = 22.8;
const PHASE01_CBMY_PCT = 17.8;

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

  const graphs = [
    projectShopSeoCrawlLinks({
      shopBasePath: "",
      categories: catalog.categories,
      fitments: catalog.fitments,
      vehicleYearRanges,
      preset: "full",
    }),
    projectShopSeoCrawlLinks({
      shopBasePath: "",
      categories: catalog.categories,
      fitments: catalog.fitments,
      vehicleYearRanges,
      preset: "collection",
    }),
  ];

  const seedEntity = (row) => ({
    namespace: row.namespace,
    path: row.path,
    filters: row.filters || {},
  });

  for (const home of graphs) {
    for (const section of [home.categories, home.vehicles, home.years]) {
      for (const row of section) {
        queue.push(seedEntity(row));
        if (YEAR_RANGE_NS.has(row.namespace)) {
          reachable.add(normalizePath(row.path));
        }
      }
    }
  }

  const seenPages = new Set(queue.map((e) => normalizePath(e.path)));
  let guard = 0;

  while (queue.length > 0 && guard < 800) {
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
  return { total: inSitemap.size, reachable: hit };
}

async function measureMarketplaceCbmy(cap) {
  const inventory = await fetch(`${API}/seo/sitemap-data`).then((r) => r.json());
  const allRanges = inventory.cbmyRangeListings || [];
  const total = allRanges.length;
  const ranges = allRanges.filter(gateCbmyRange);
  const byGroup = new Map();

  for (const row of ranges) {
    const key = `${String(row.categorySlug || "").toLowerCase()}|${String(row.brand || "").toLowerCase()}|${String(row.model || "").toLowerCase()}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(row);
  }

  const reachable = new Set();
  const queue = [];

  for (const group of byGroup.values()) {
    for (const row of group.slice(0, cap)) {
      const slug = String(row.slug || "").toLowerCase();
      if (!slug || reachable.has(slug)) continue;
      reachable.add(slug);
      queue.push({ row, group });
    }
  }

  let guard = 0;
  while (queue.length > 0 && guard < 5000) {
    guard += 1;
    const { row, group } = queue.shift();
    const currentRange = `${row.yearFrom}-${row.yearTo}`;
    const siblings = group
      .filter((r) => `${r.yearFrom}-${r.yearTo}` !== currentRange)
      .slice(0, cap);
    for (const sib of siblings) {
      const slug = String(sib.slug || "").toLowerCase();
      if (!slug || reachable.has(slug)) continue;
      reachable.add(slug);
      queue.push({ row: sib, group });
    }
  }

  return { total, linked: reachable.size, parents: byGroup.size, gated: ranges.length };
}

function gateCbmyRange(row) {
  return Number(row?.productCount || 0) >= 2;
}

console.log("\n=== SEO-LINKGRAPH-BOOST-PHASE-02 COVERAGE ===\n");

const catalog = await loadShopCatalog(SHOP_SLUG);
const sitemapYearPaths = await loadShopSitemapYearRanges(SHOP_SLUG);
const shop = simulateShopYearRangeReach(catalog, sitemapYearPaths);
const shopPct = shop.total ? (shop.reachable / shop.total) * 100 : 0;

const cbmy = await measureMarketplaceCbmy(CBMY_LINK_CAP);
const cbmyPct = cbmy.total ? (cbmy.linked / cbmy.total) * 100 : 0;
const cbmyGatedPct = cbmy.gated ? (cbmy.linked / cbmy.gated) * 100 : 0;

console.log(`Shop: ${SHOP_SLUG}`);
console.log(`  SHOP_*_YEAR_RANGE in sitemap: ${shop.total}`);
console.log(`  Reachable (home BFS + contextual): ${shop.reachable} (${pct(shop.reachable, shop.total)})`);
console.log(`  Limits: home years=${SHOP_CRAWL_LIMITS.full.years}, contextual=${SHOP_CRAWL_LIMITS.contextual}`);

console.log("\nMarketplace CBMY_RANGE:");
console.log(`  Sitemap inventory: ${cbmy.total} (${cbmy.gated} pass product gate)`);
console.log(
  `  Reachable via CBM + range sibling BFS (≤${CBMY_LINK_CAP}/hop): ${cbmy.linked} (${pct(cbmy.linked, cbmy.total)} of all, ${pct(cbmy.linked, cbmy.gated)} of gated)`,
);

console.log("\n| Metric | Phase-01 | Phase-02 | Target |");
console.log("|--------|----------|----------|--------|");
console.log(
  `| SHOP_YEAR_RANGE | ${PHASE01_SHOP_PCT}% | ${shopPct.toFixed(1)}% | 40%+ |`,
);
console.log(
  `| CBMY_RANGE (all inventory) | ${PHASE01_CBMY_PCT}% | ${cbmyPct.toFixed(1)}% | 30%+ |`,
);
console.log(
  `| CBMY_RANGE (gated inventory) | — | ${cbmyGatedPct.toFixed(1)}% | — |`,
);
console.log("");

const shopOk = shopPct >= 40;
const cbmyOk = cbmyPct >= 30 || cbmyGatedPct >= 30;
if (!shopOk || !cbmyOk) {
  console.log(
    `Note: projection ${shopOk ? "SHOP OK" : "SHOP below target"}, ${cbmyOk ? "CBMY OK" : "CBMY below target"}`,
  );
}
