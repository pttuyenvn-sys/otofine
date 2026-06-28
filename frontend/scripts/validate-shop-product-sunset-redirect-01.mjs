/**
 * Unit tests for shop product sunset redirect parsing.
 * Run: node frontend/scripts/validate-shop-product-sunset-redirect-01.mjs
 */
import {
  parseShopProductDetailPath,
} from "../lib/shopsite/resolveShopSunsetRedirectUrl.js";
import { buildShopSunsetRedirectUrl } from "../lib/shopsite/buildShopSunsetRedirectUrl.js";

let passed = 0;
let failed = 0;

function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}`);
  }
}

const productSlug =
  "den-pha-cx5-mazda-cx-5-2018-2021-kb8n51041h-7473";

assert(
  "SEO product path detected",
  parseShopProductDetailPath(`/${productSlug}`)?.productId === 7473,
);
assert(
  "short /p/ path detected",
  parseShopProductDetailPath("/p/7473")?.productId === 7473,
);
assert(
  "taxonomy not classified as product",
  parseShopProductDetailPath("/phu-tung-toyota") === null,
);
assert(
  "taxonomy builder still skips products",
  buildShopSunsetRedirectUrl(
    new URL(`https://shop.otofine.com/${productSlug}`),
  ) === null,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
