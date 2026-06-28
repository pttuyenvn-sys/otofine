#!/usr/bin/env node
/**
 * Lightweight smoke tests for Home routing & SEO invariants.
 *
 * Usage:
 *   SMOKE_BASE_URL=http://localhost:3001 SHOP_SMOKE_DOMAINS="hungpt.otofine.com,phutungoto355.otofine.com" node tests/smoke/smoke-tests.js
 *
 * This script is intentionally dependency-free (uses global fetch available in Node 20+).
 * It expects the frontend server to be running (next dev or next start).
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3001";
const SHOP_DOMAINS = (process.env.SHOP_SMOKE_DOMAINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 10000);

const numericRoutes = [
  "/phu-tung-mazda-3-2024",
  "/phu-tung-mazda-6-2024",
  "/phu-tung-cx-5-2024",
  "/phu-tung-i10-2024",
  "/phu-tung-q5-2024",
  "/phu-tung-x5-2024",
  "/phu-tung-320i-2024",
  "/phu-tung-c200-2024",
];

function fail(msg) {
  console.error("FAIL:", msg);
}
function pass(msg) {
  console.log("PASS:", msg);
}

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal, redirect: "follow" });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function checkNumericRoutes() {
  console.log("Checking numeric vehicle listing routes...");
  const failures = [];
  for (const path of numericRoutes) {
    const url = `${BASE.replace(/\/$/, "")}${path}`;
    try {
      const res = await fetchWithTimeout(url);
      if (res.status !== 200) {
        failures.push(`${path} returned HTTP ${res.status}`);
        fail(`${path} returned HTTP ${res.status}`);
        continue;
      }
      // Ensure final URL is not a product detail (heuristic: not contain /product/ or /p/)
      const finalUrl = res.url || url;
      if (/(\/product\/|\/p\/)/.test(finalUrl)) {
        failures.push(`${path} redirected to product URL ${finalUrl}`);
        fail(`${path} redirected to product URL ${finalUrl}`);
        continue;
      }
      const html = await res.text();
      // SSR H1 check (listing hero)
      if (!(/<h1[^>]*id=["']listing-h1["']|class=["'][^"']*listing-hero__h1[^"']*["']|<h1[^>]*>/i.test(html))) {
        failures.push(`${path} missing SSR <h1>`);
        fail(`${path} missing SSR <h1>`);
        continue;
      }
      pass(`${path} OK (200, no product redirect, H1 present)`);
    } catch (err) {
      failures.push(`${path} fetch error: ${String(err)}`);
      fail(`${path} fetch error: ${String(err)}`);
    }
  }
  return failures;
}

async function checkSeoSsR() {
  console.log("Checking SEO SSR invariants on / (homepage) and a sample listing...");
  const targets = ["/", numericRoutes[0]];
  const failures = [];
  for (const path of targets) {
    const url = `${BASE.replace(/\/$/, "")}${path}`;
    try {
      const res = await fetchWithTimeout(url);
      if (res.status !== 200) {
        failures.push(`${path} returned HTTP ${res.status}`);
        fail(`SEO ${path} returned HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      // canonical
      if (!/<link[^>]+rel=["']canonical["'][^>]*>/i.test(html)) {
        failures.push(`${path} missing canonical link`);
        fail(`${path} missing canonical link`);
        continue;
      } else {
        pass(`${path} canonical link present`);
      }

      // For homepage ("/") only assert canonical/meta and 200.
      if (path === "/") {
        pass(`${path} OK (200 and canonical present; H1/SEO intro are client-rendered)`);
        continue;
      }

      // For listing pages assert H1 and SEO intro (server-side)
      if (!/<h1[^>]*>[\s\S]*?<\/h1>/i.test(html)) {
        failures.push(`${path} missing H1`);
        fail(`${path} missing H1`);
      } else {
        pass(`${path} H1 present`);
      }
      // SEO intro (listing hero subtitle) detect by class
      if (!/listing-hero__sub|seo-ab-root|PartKnowledgeSeoPage/i.test(html)) {
        failures.push(`${path} missing SEO intro / listing hero subtitle`);
        fail(`${path} missing SEO intro / listing hero subtitle`);
      } else {
        pass(`${path} SEO intro present`);
      }
    } catch (err) {
      failures.push(`${path} fetch error: ${String(err)}`);
      fail(`SEO ${path} fetch error: ${String(err)}`);
    }
  }
  return failures;
}

async function checkShopSubdomains() {
  if (!SHOP_DOMAINS.length) {
    console.log("No SHOP_SMOKE_DOMAINS provided; skipping shopsite subdomain checks.");
    return [];
  }
  console.log("Checking shop subdomains:", SHOP_DOMAINS.join(", "));
  const failures = [];
  for (const host of SHOP_DOMAINS) {
    try {
      const url = `${BASE.replace(/\/\/[^/]+/, `//${host}`)}/`; // replace host in base
      const res = await fetchWithTimeout(url, { redirect: "follow" });
      if (res.status !== 200) {
        failures.push(`${host} returned HTTP ${res.status}`);
        fail(`${host} returned HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      // Heuristic: shop SSR should not contain the global fallback message about product list failing.
      if (/Không tải được danh sách sản phẩm|Không tìm thấy|fallback/i.test(html)) {
        failures.push(`${host} appears to render fallback/apex homepage content`);
        fail(`${host} appears to render fallback/apex homepage content`);
        continue;
      }
      pass(`${host} OK (shop SSR content looks present)`);
    } catch (err) {
      failures.push(`${host} fetch error: ${String(err)}`);
      fail(`${host} fetch error: ${String(err)}`);
    }
  }
  return failures;
}

async function run() {
  const allFailures = [];
  allFailures.push(...(await checkNumericRoutes()));
  allFailures.push(...(await checkSeoSsR()));
  allFailures.push(...(await checkShopSubdomains()));

  if (allFailures.length) {
    console.error("\nSMOKE TESTS FAILED:", allFailures.length, "failure(s)");
    process.exit(2);
  } else {
    console.log("\nSMOKE TESTS PASSED");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Smoke runner error:", err);
  process.exit(3);
});

