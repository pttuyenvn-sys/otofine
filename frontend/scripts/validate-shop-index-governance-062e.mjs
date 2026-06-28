#!/usr/bin/env node
/**
 * ARCH-06.2E — shop index governance validation.
 *
 * Usage:
 *   node scripts/validate-shop-index-governance-062e.mjs [apiBase]
 */

import { getShopIndexTier } from "../lib/shopsite/shopIndexGovernance.js";

const apiBase = (process.argv[2] || process.env.NEXT_PUBLIC_API_URL || "https://otofine.com/api")
  .replace(/\/$/, "");

async function fetchPublicShops() {
  const res = await fetch(`${apiBase}/public/shops/?perPage=100`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const slugs = (data.items || []).map((s) => s.slug).filter(Boolean);

  const shops = await Promise.all(
    slugs.map(async (slug) => {
      const detail = await fetch(`${apiBase}/public/shops/${encodeURIComponent(slug)}`, {
        headers: { Accept: "application/json" },
      });
      if (!detail.ok) return null;
      return detail.json();
    }),
  );

  return shops.filter(Boolean);
}

function robotsLabel(robots) {
  return `${robots.index ? "index" : "noindex"},${robots.follow ? "follow" : "nofollow"}`;
}

console.log("\nARCH-06.2E governance validation\n");

const shops = await fetchPublicShops();

console.log("| Shop | Products | Tier | Robots |");
console.log("| ---- | -------: | ---- | ------ |");

for (const shop of shops) {
  const { tier, robots } = getShopIndexTier(shop);
  console.log(
    `| ${shop.slug} | ${shop.productCount ?? 0} | ${tier} | ${robotsLabel(robots)} |`,
  );
}

console.log("");

const expected = {
  phutungoto355: "INDEX",
  phutungotoautopt: "INDEX",
  hungpt: "CRAWL",
};

let failed = 0;
for (const [slug, want] of Object.entries(expected)) {
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) {
    console.log(`MISSING shop in API: ${slug}`);
    failed++;
    continue;
  }
  const { tier } = getShopIndexTier(shop);
  if (tier !== want) {
    console.log(`FAIL ${slug}: expected ${want}, got ${tier}`);
    failed++;
  }
}

if (failed === 0) {
  console.log("Expected tier checks PASS\n");
} else {
  console.log(`${failed} expected tier check(s) FAILED\n`);
}

process.exit(failed === 0 ? 0 : 1);
