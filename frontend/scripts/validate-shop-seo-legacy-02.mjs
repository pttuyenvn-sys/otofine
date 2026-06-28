#!/usr/bin/env node
/**
 * SHOP-SEO-LEGACY-02 — Legacy `/san-pham` → `/phu-tung-o-to` redirect smoke tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildShopLegacyCollectionRedirectTarget,
  buildSubdomainLegacyCollectionRedirectUrl,
  isShopLegacyCollectionSubdomainPath,
  parseShopLegacyCollectionApexPath,
} from "../lib/shopsite/shopLegacyCollectionRedirect.js";
import { SHOP_COLLECTION_PATH } from "../lib/shopseo/namespace.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("\n=== SHOP-SEO-LEGACY-02 ===\n");

assert.equal(isShopLegacyCollectionSubdomainPath("/san-pham"), true);
assert.equal(isShopLegacyCollectionSubdomainPath("/san-pham/"), true);
assert.equal(isShopLegacyCollectionSubdomainPath("/phu-tung-o-to"), false);
assert.equal(isShopLegacyCollectionSubdomainPath("/loc-gio-o-to"), false);
assert.equal(isShopLegacyCollectionSubdomainPath("/phu-tung-toyota-vios"), false);
assert.equal(isShopLegacyCollectionSubdomainPath("/phu-tung-toyota-vios-2020"), false);
console.log("PASS subdomain path classifier");

assert.equal(parseShopLegacyCollectionApexPath("/shops/demo/san-pham"), "demo");
assert.equal(parseShopLegacyCollectionApexPath("/shops/demo/san-pham/"), "demo");
assert.equal(parseShopLegacyCollectionApexPath("/shops/demo/phu-tung-o-to"), null);
assert.equal(parseShopLegacyCollectionApexPath("/shop-demo/san-pham"), null);
console.log("PASS apex path parser");

const apexTarget = buildShopLegacyCollectionRedirectTarget("demoshop", {
  location: { hostname: "otofine.com", port: "", protocol: "https:" },
});
assert.equal(apexTarget, "https://demoshop.otofine.com/phu-tung-o-to");
const withQuery = buildShopLegacyCollectionRedirectTarget("demoshop", {
  location: { hostname: "otofine.com", port: "", protocol: "https:" },
  search: "?q=loc",
});
assert.equal(withQuery, "https://demoshop.otofine.com/phu-tung-o-to?q=loc");
console.log("PASS apex redirect target");

const subUrl = buildSubdomainLegacyCollectionRedirectUrl(
  new URL("https://demoshop.otofine.com/san-pham?q=1"),
);
assert.equal(subUrl.pathname, SHOP_COLLECTION_PATH);
assert.equal(subUrl.search, "?q=1");
assert.equal(subUrl.hostname, "demoshop.otofine.com");
console.log("PASS subdomain redirect target");

const middlewareSrc = readFileSync(join(root, "middleware.js"), "utf8");
assert.ok(
  middlewareSrc.includes("legacy-collection-redirect"),
  "middleware logs legacy redirects in dev",
);
const legacyBlock = middlewareSrc.indexOf("SHOP-SEO-LEGACY-02");
const rewriteCall = middlewareSrc.indexOf("const decision = resolveShopRewrite");
assert.ok(legacyBlock >= 0 && rewriteCall >= 0 && legacyBlock < rewriteCall);
assert.ok(
  middlewareSrc.includes("NextResponse.redirect(target, 301)"),
  "middleware uses 301",
);
console.log("PASS middleware wiring");

const pageSrc = readFileSync(
  join(root, "app/(shopsite)/shops/[slug]/san-pham/page.js"),
  "utf8",
);
assert.ok(!pageSrc.includes("ShopSeoListingView"), "apex alias page no longer renders");
assert.ok(pageSrc.includes("permanentRedirect"), "apex fallback redirect");
console.log("PASS apex route fallback");

const namespaceSrc = readFileSync(join(root, "lib/shopseo/namespace.js"), "utf8");
assert.ok(namespaceSrc.includes('LEGACY_COLLECTION: "/san-pham"'), "LEGACY_COLLECTION kept");
const parseSrc = readFileSync(join(root, "lib/shopseo/parseShopSeoPath.js"), "utf8");
assert.ok(parseSrc.includes("LEGACY_COLLECTION"), "parseShopSeoPath legacy support kept");
console.log("PASS parser compatibility layer");

console.log("\nAll SHOP-SEO-LEGACY-02 cases passed.\n");
