/**
 * ARCH-MP-03B.9J — seo-page same-origin shim contract.
 * Run: node --experimental-loader ./tests/unit/alias-loader.mjs ./tests/unit/seo-page-shim-run.mjs
 */
import assert from "node:assert/strict";

const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const missing = await fetchJson("/api/seo-page/can-truoc-o-to");
assert.equal(missing.status, 200, "missing CMS article must be HTTP 200");
assert.equal(missing.body?.found, false, "missing CMS article must return found:false");

const hit = await fetchJson("/api/seo-page/ma-phanh-truoc-o-to");
assert.equal(hit.status, 200, "CMS article must be HTTP 200");
assert.equal(hit.body?.found, true, "CMS article must return found:true");
assert.ok(hit.body?.data, "CMS article must include data payload");

console.log("PASS: seo-page shim contract");
