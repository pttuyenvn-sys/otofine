#!/usr/bin/env node
/**
 * SHOP-LIFECYCLE-API-IMPLEMENT-01 — integration smoke for lifecycle endpoint.
 *
 * Run: node backend/scripts/validate-shop-lifecycle-api-01.mjs
 */
import "dotenv/config";

const API = process.env.API_INTERNAL_ORIGIN
  ? `${String(process.env.API_INTERNAL_ORIGIN).replace(/\/$/, "")}/api`
  : "http://127.0.0.1:5000/api";

async function getLifecycle(slug) {
  const res = await fetch(`${API}/public/shops/${encodeURIComponent(slug)}/lifecycle`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function assertCase(label, actual, expectedStatus, expectedBody) {
  const ok =
    actual.status === expectedStatus &&
    JSON.stringify(actual.body) === JSON.stringify(expectedBody);
  console.log(ok ? `PASS  ${label}` : `FAIL  ${label}`);
  if (!ok) {
    console.error("  expected:", expectedStatus, expectedBody);
    console.error("  actual:  ", actual.status, actual.body);
    process.exitCode = 1;
  }
}

const publicShop = await getLifecycle("phutungoto355");
assertCase("public shop", publicShop, 200, {
  exists: true,
  publicStatus: "public",
  redirectEligible: false,
});

const unknown = await getLifecycle("zzz-not-a-real-shop-999");
assertCase("unknown slug", unknown, 200, {
  exists: false,
  publicStatus: null,
  redirectEligible: false,
});

const invalid = await getLifecycle("INVALID!!");
assertCase("invalid slug param", invalid, 404, { error: "Shop không tồn tại" });

console.log("\nNote: suspended/private/pending live cases require shops with those statuses in DB.");
console.log("Mapping rules covered by shopLifecycle.test.js unit suite.");
