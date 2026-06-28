/**
 * SITEMAP-PARTITION-AUTOSCALE-IMPLEMENT-01 — parity + live validation.
 */
const BASE = process.env.SITEMAP_VALIDATE_BASE || "http://127.0.0.1:3000";
const EXPECTED_APEX_TOTAL = 12010;

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function extractSitemapIndexChildren(xml) {
  return extractLocs(xml);
}

async function fetchXml(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.text();
}

function setDiff(a, b) {
  const bs = new Set(b);
  return [...a].filter((u) => !bs.has(u));
}

async function probePage(url) {
  const res = await fetch(url, {
    headers: { Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  const html = await res.text();
  const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  const robots = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["']/i);
  return {
    status: res.status,
    canonical: canon?.[1] || null,
    robots: robots?.[1] || null,
    finalUrl: res.url,
  };
}

async function loadGroupUrls(rootPath) {
  const xml = await fetchXml(rootPath);
  if (xml.includes("<sitemapindex")) {
    const children = extractSitemapIndexChildren(xml);
    const all = [];
    for (const child of children) {
      const childPath = new URL(child).pathname;
      const partXml = await fetchXml(childPath);
      all.push(...extractLocs(partXml));
    }
    return all;
  }
  return extractLocs(xml);
}

async function main() {
  console.log("SITEMAP-PARTITION-AUTOSCALE-IMPLEMENT-01 validation");
  console.log("Base:", BASE);

  const rootXml = await fetchXml("/sitemap.xml");
  if (!rootXml.includes("<sitemapindex")) {
    throw new Error("sitemap.xml must be a sitemap index");
  }

  const rootChildren = extractSitemapIndexChildren(rootXml);
  const expectedChildren = [
    "/sitemap-products.xml",
    "/sitemap-marketplace-core.xml",
    "/sitemap-marketplace-location.xml",
    "/sitemap-shops.xml",
  ];
  for (const child of expectedChildren) {
    if (!rootChildren.some((u) => new URL(u).pathname === child)) {
      throw new Error(`Root index missing child ${child}`);
    }
  }

  const [products, core, location, shops] = await Promise.all([
    loadGroupUrls("/sitemap-products.xml"),
    loadGroupUrls("/sitemap-marketplace-core.xml"),
    loadGroupUrls("/sitemap-marketplace-location.xml"),
    loadGroupUrls("/sitemap-shops.xml"),
  ]);

  const marketplaceUnion = [...products, ...core, ...location];
  const marketplaceSet = new Set(marketplaceUnion);
  const dupInUnion =
    marketplaceUnion.length - marketplaceSet.size;

  const shopSet = new Set(shops);
  const dupInShops = shops.length - shopSet.size;

  const overlap = shops.filter((u) => marketplaceSet.has(u));

  console.log("\n=== COUNTS ===");
  console.log(
    JSON.stringify(
      {
        products: products.length,
        marketplaceCore: core.length,
        marketplaceLocation: location.length,
        shops: shops.length,
        marketplaceUnion: marketplaceUnion.length,
        marketplaceUnique: marketplaceSet.size,
        expectedApexTotal: EXPECTED_APEX_TOTAL,
      },
      null,
      2,
    ),
  );

  console.log("\n=== PARITY ===");
  if (marketplaceSet.size !== EXPECTED_APEX_TOTAL) {
    throw new Error(
      `Marketplace union ${marketplaceSet.size} !== expected ${EXPECTED_APEX_TOTAL}`,
    );
  }
  if (dupInUnion !== 0) {
    throw new Error(`Duplicate URLs in marketplace union: ${dupInUnion}`);
  }
  if (dupInShops !== 0) {
    throw new Error(`Duplicate URLs in shops group: ${dupInShops}`);
  }
  if (overlap.length > 0) {
    console.warn("WARN: shop URLs overlap marketplace (subdomain vs apex):", overlap.length);
  }
  console.log("Missing URLs = 0 (size match)");
  console.log("Duplicate URLs = 0");

  const samples = {
    products: products[0],
    marketplaceCore: core.find((u) => !new URL(u).pathname.match(/^\/$/)) || core[0],
    marketplaceLocation: location[0],
    shops: shops[0],
  };

  console.log("\n=== SAMPLE URL PROBES ===");
  for (const [label, url] of Object.entries(samples)) {
    if (!url) {
      console.log(`${label}: (no URL)`);
      continue;
    }
    const probe = await probePage(url);
    console.log(
      JSON.stringify({
        label,
        url,
        status: probe.status,
        canonical: probe.canonical,
        robots: probe.robots,
      }),
    );
    if (probe.status !== 200) {
      throw new Error(`Sample ${label} not HTTP 200`);
    }
  }

  console.log("\nPASS: SITEMAP-PARTITION-AUTOSCALE-IMPLEMENT-01");
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exitCode = 1;
});
