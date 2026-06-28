/**
 * Unit tests for shop lifecycle sunset mapping.
 *
 * Run: node backend/domains/shopPublic/services/shopLifecycle.test.js
 */
import { resolveShopLifecycleFromRow } from "./shopLifecycle.service.js";

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}`);
    console.error("      expected:", JSON.stringify(expected));
    console.error("      actual:  ", JSON.stringify(actual));
  }
}

assert("unknown slug", resolveShopLifecycleFromRow(null), {
  exists: false,
  publicStatus: null,
  redirectEligible: false,
});

assert("public shop", resolveShopLifecycleFromRow({ public_status: "public" }), {
  exists: true,
  publicStatus: "public",
  redirectEligible: false,
});

assert("pending shop", resolveShopLifecycleFromRow({ public_status: "pending" }), {
  exists: true,
  publicStatus: "pending",
  redirectEligible: false,
});

assert("private shop", resolveShopLifecycleFromRow({ public_status: "private" }), {
  exists: true,
  publicStatus: "private",
  redirectEligible: true,
});

assert("suspended shop", resolveShopLifecycleFromRow({ public_status: "suspended" }), {
  exists: true,
  publicStatus: "suspended",
  redirectEligible: true,
});

assert("draft alias → pending", resolveShopLifecycleFromRow({ public_status: "draft" }), {
  exists: true,
  publicStatus: "pending",
  redirectEligible: false,
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
