#!/usr/bin/env node
/**
 * SHOP-SEO-JSONLD-01 — JSON-LD URL parity with canonical source.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeShopCanonicalSubPath } from "../lib/shopsite/normalizeShopCanonicalSubPath.js";
import { SHOP_COLLECTION_PATH } from "../lib/shopseo/namespace.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("\n=== SHOP-SEO-JSONLD-01 ===\n");

assert.equal(normalizeShopCanonicalSubPath(""), "");
assert.equal(normalizeShopCanonicalSubPath("/"), "");
assert.equal(normalizeShopCanonicalSubPath("gioi-thieu"), "gioi-thieu");
assert.equal(normalizeShopCanonicalSubPath(SHOP_COLLECTION_PATH), "phu-tung-o-to");
assert.equal(normalizeShopCanonicalSubPath("/loc-gio-o-to"), "loc-gio-o-to");
assert.equal(
  normalizeShopCanonicalSubPath("/phu-tung-toyota-vios-2020"),
  "phu-tung-toyota-vios-2020",
);
console.log("PASS subPath normalization");

const buildSrc = readFileSync(join(root, "lib/shopsite/buildShopJsonLd.js"), "utf8");
assert.ok(buildSrc.includes('const url = canonicalUrl'), "buildShopJsonLd uses canonicalUrl as url");
assert.ok(buildSrc.includes('"@id": `${url}#shop`'), "buildShopJsonLd @id derives from url");
console.log("PASS buildShopJsonLd contract (canonicalUrl → url / @id)");

const layoutSrc = readFileSync(
  join(root, "app/(shopsite)/shops/[slug]/layout.js"),
  "utf8",
);
assert.ok(!layoutSrc.includes("ShopJsonLd"), "layout must not emit ShopJsonLd");
assert.ok(
  !layoutSrc.includes('getShopCanonicalUrl(shop.slug, "")'),
  "layout must not hardcode home canonical for JSON-LD",
);
console.log("PASS layout no longer emits home-only JSON-LD");

const tenantSrc = readFileSync(
  join(root, "components/shopsite/ShopTenantJsonLd.jsx"),
  "utf8",
);
assert.ok(tenantSrc.includes("getShopSeoContext"), "tenant JSON-LD uses getShopSeoContext");
assert.ok(tenantSrc.includes("normalizeShopCanonicalSubPath"), "tenant JSON-LD normalizes subPath");
console.log("PASS ShopTenantJsonLd uses getShopSeoContext");

const listingSrc = readFileSync(
  join(root, "components/shopsite/ShopSeoListingView.jsx"),
  "utf8",
);
assert.ok(listingSrc.includes("ShopTenantJsonLd"), "listing view emits page-scoped JSON-LD");
console.log("PASS ShopSeoListingView wires ShopTenantJsonLd");

console.log("\nAll SHOP-SEO-JSONLD-01 cases passed.\n");
