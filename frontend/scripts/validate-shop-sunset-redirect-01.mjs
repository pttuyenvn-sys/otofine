/**
 * Unit tests for buildShopSunsetRedirectUrl.
 * Run: node frontend/scripts/validate-shop-sunset-redirect-01.mjs
 */
import { buildShopSunsetRedirectUrl } from "../lib/shopsite/buildShopSunsetRedirectUrl.js";

let passed = 0;
let failed = 0;

function assert(label, actual, expectedHref) {
  const href = actual ? actual.href : null;
  const ok = href === expectedHref;
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}`);
    console.error("  expected:", expectedHref);
    console.error("  actual:  ", href);
  }
}

function url(path, search = "") {
  return new URL(`https://shop.otofine.com${path}${search}`);
}

assert("HOME", buildShopSunsetRedirectUrl(url("/")), "https://otofine.com/");
assert(
  "ABOUT",
  buildShopSunsetRedirectUrl(url("/gioi-thieu")),
  "https://otofine.com/",
);
assert(
  "CONTACT",
  buildShopSunsetRedirectUrl(url("/lien-he")),
  "https://otofine.com/",
);
assert(
  "COLLECTION",
  buildShopSunsetRedirectUrl(url("/phu-tung-o-to")),
  "https://otofine.com/phu-tung-o-to",
);
assert(
  "LEGACY san-pham single hop",
  buildShopSunsetRedirectUrl(url("/san-pham")),
  "https://otofine.com/phu-tung-o-to",
);
assert(
  "SHOP_BRAND taxonomy",
  buildShopSunsetRedirectUrl(url("/phu-tung-toyota")),
  "https://otofine.com/phu-tung-toyota",
);
assert(
  "SHOP_CATEGORY taxonomy",
  buildShopSunsetRedirectUrl(url("/ma-phanh-toyota-vios")),
  "https://otofine.com/ma-phanh-toyota-vios",
);
assert(
  "SHOP_CATEGORY year range",
  buildShopSunsetRedirectUrl(url("/ma-phanh-toyota-vios-2014-2020")),
  "https://otofine.com/ma-phanh-toyota-vios-2014-2020",
);
assert(
  "query string preserved",
  buildShopSunsetRedirectUrl(url("/phu-tung-toyota", "?page=2")),
  "https://otofine.com/phu-tung-toyota?page=2",
);
assert(
  "product slug excluded",
  buildShopSunsetRedirectUrl(
    url("/den-pha-cx5-mazda-cx-5-2018-2021-kb8n51041h-7473"),
  ),
  null,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
