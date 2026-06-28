#!/usr/bin/env node
const TIMEOUT_MS = 10000;
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3001";
const SHOP_DOMAINS = (process.env.SHOP_SMOKE_DOMAINS || "").split(",").map(s=>s.trim()).filter(Boolean);
const fetch = global.fetch || require("node-fetch");

const routes = [
  "/phu-tung-mazda-3-2024",
  "/phu-tung-mazda-6-2024",
  "/phu-tung-cx-5-2024",
  "/phu-tung-i10-2024",
  "/phu-tung-q5-2024",
  "/phu-tung-x5-2024",
  "/phu-tung-320i-2024",
  "/phu-tung-c200-2024",
];

function fail(m){ console.error("FAIL:",m); }
function pass(m){ console.log("PASS:",m); }

async function fetchWithTimeout(url, opts={}) {
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {...opts, signal: controller.signal, redirect: "follow"});
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function run() {
  let failures = 0;
  for (const r of routes) {
    const url = `${BASE.replace(/\/$/,"")}${r}`;
    try {
      const res = await fetchWithTimeout(url);
      if (res.status !== 200) { fail(`${r} HTTP ${res.status}`); failures++; continue; }
      const html = await res.text();
      // no redirect to product detail
      if (/(\/product\/|\/p\/)/.test(res.url)) { fail(`${r} redirected to product ${res.url}`); failures++; continue; }
      // SSR H1 check
      if (!(/<h1[^>]*id=["']listing-h1["']|class=["'][^"']*listing-hero__h1[^"']*["']|<h1[^>]*>/i.test(html))) {
        fail(`${r} missing SSR H1`); failures++; continue;
      }
      // canonical check
      if (!/<link[^>]+rel=["']canonical["'][^>]*>/i.test(html)) {
        fail(`${r} missing canonical`); failures++; continue;
      }
      pass(`${r} OK`);
    } catch (err) {
      fail(`${r} fetch error ${String(err)}`); failures++;
    }
  }

  // server-side unit checks: parseUrlState should produce brand/model/year
  try {
    const listingHelpers = require("../../components/pages/home/services/listingUrlState.js");
    const checkSlug = "/phu-tung-mazda-6-2024";
    const parsed = listingHelpers.parseUrlState(checkSlug, { categories: [], brands: [], locations: [], vehicleHot: null });
    if (!parsed.brand || !parsed.model) { fail("parseUrlState failed for " + checkSlug); failures++; } else pass("parseUrlState OK");
  } catch (err) { fail("parseUrlState test error " + String(err)); failures++; }

  // optional shopsite checks
  if (SHOP_DOMAINS.length) {
    for (const host of SHOP_DOMAINS) {
      try {
        const shopUrl = `${BASE.replace(/\/\/[^/]+/, `//${host}`)}/`;
        const res = await fetchWithTimeout(shopUrl);
        if (res.status !== 200) { fail(`${host} HTTP ${res.status}`); failures++; continue; }
        const html = await res.text();
        if (/Không tải được danh sách sản phẩm|Không tìm thấy|fallback/i.test(html)) { fail(`${host} appears fallback`); failures++; continue; }
        pass(`shopsite ${host} OK`);
      } catch (err) { fail(`${host} fetch error ${String(err)}`); failures++; }
    }
  } else {
    console.log("No SHOP_SMOKE_DOMAINS provided; skipping shopsite checks");
  }

  if (failures) {
    console.error(`Routing invariant tests failed: ${failures} failures`);
    process.exit(2);
  } else {
    console.log("Routing invariant tests passed");
    process.exit(0);
  }
}

run().catch(err => { console.error("Unexpected error", err); process.exit(3); });

