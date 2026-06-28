#!/usr/bin/env node
/**
 * ARCH-05C.2A.1 — validate fitment listing links on product detail payloads.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildListingIdentity } = require(
  path.join(frontendRoot, "components/pages/home/services/listingSeoState.js"),
);
const { buildListingUrlFromIdentity } = require(
  path.join(frontendRoot, "components/pages/home/services/listingUrlState.js"),
);

const API_BASE = process.env.API_BASE || "http://localhost:5000/api";
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const productId = args.product || "218";
const sampleSize = Number(args.sample || 0) || 0;

function buildVehicleOwnerPath({ brand, model, year } = {}) {
  const identity = buildListingIdentity({
    categoryName: "",
    hasCategory: false,
    brand,
    model,
    year,
    location: "",
  });
  return buildListingUrlFromIdentity(identity);
}

function normalizeYear(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readFitmentFields(row) {
  if (!row || typeof row !== "object") {
    return { brand: "", model: "", yearFrom: null, yearTo: null };
  }
  return {
    brand: String(row.hang_xe ?? row.brand ?? "").trim(),
    model: String(row.ten_xe ?? row.model ?? "").trim(),
    yearFrom: normalizeYear(row.year_from ?? row.yearFrom),
    yearTo: normalizeYear(row.year_to ?? row.yearTo),
  };
}

function buildFitmentListingLinks(cars) {
  if (!Array.isArray(cars) || cars.length === 0) return [];
  const byHref = new Map();
  const add = (href, label, type) => {
    const path = String(href || "").trim();
    const text = String(label || "").trim();
    if (!path || path === "/" || !text) return;
    if (!byHref.has(path)) byHref.set(path, { href: path, label: text, type });
  };

  for (const row of cars) {
    const { brand, model, yearFrom, yearTo } = readFitmentFields(row);
    if (!brand && !model) continue;
    const vehicleLabel = [brand, model].filter(Boolean).join(" ").trim();
    if (vehicleLabel) {
      add(buildVehicleOwnerPath({ brand, model }), vehicleLabel, "vehicle");
    }
    if (yearFrom != null && yearTo != null) {
      if (yearFrom === yearTo) {
        add(
          buildVehicleOwnerPath({ brand, model, year: String(yearFrom) }),
          `${vehicleLabel} ${yearFrom}`.trim(),
          "vehicleYear",
        );
      } else {
        const range = `${yearFrom}-${yearTo}`;
        add(
          buildVehicleOwnerPath({ brand, model, year: range }),
          `${vehicleLabel} ${range}`.trim(),
          "vehicleYearRange",
        );
      }
    }
  }

  const typeOrder = { vehicleYearRange: 0, vehicleYear: 1, vehicle: 2 };
  return [...byHref.values()].sort((a, b) => {
    const ta = typeOrder[a.type] ?? 9;
    const tb = typeOrder[b.type] ?? 9;
    if (ta !== tb) return ta - tb;
    return a.label.localeCompare(b.label, "vi");
  });
}

function summarizeFitmentListingLinks(links) {
  const list = Array.isArray(links) ? links : [];
  return {
    vehicle: list.filter((x) => x.type === "vehicle").length,
    vehicleYear: list.filter((x) => x.type === "vehicleYear").length,
    vehicleYearRange: list.filter((x) => x.type === "vehicleYearRange").length,
    uniqueUrls: list.length,
  };
}

async function fetchProduct(id) {
  const res = await fetch(`${API_BASE}/product/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`product ${id}: HTTP ${res.status}`);
  return res.json();
}

async function fetchProductIds(limit) {
  const res = await fetch(`${API_BASE}/seo/sitemap-data`);
  if (!res.ok) throw new Error(`sitemap-data: HTTP ${res.status}`);
  const json = await res.json();
  return (json.products || [])
    .map((p) => p?.id ?? p?.productId)
    .filter((id) => id != null && Number(id) > 0)
    .slice(0, limit);
}

function printProductReport(id, payload) {
  const cars = payload?.cars || [];
  const links = buildFitmentListingLinks(cars);
  const summary = summarizeFitmentListingLinks(links);

  console.log(`\n=== Product ${id} ===`);
  console.log(`Fitment rows: ${cars.length}`);
  console.log("| Link Type | URL |");
  console.log("| --------- | --- |");
  for (const link of links) {
    console.log(`| ${link.type} | ${link.href} |`);
  }
  console.log("\nSummary:", summary);
  return { cars: cars.length, links, summary };
}

async function main() {
  if (productId) {
    const payload = await fetchProduct(productId);
    printProductReport(productId, payload);
  }

  if (sampleSize > 0) {
    const ids = await fetchProductIds(sampleSize);
    let withFitment = 0;
    let vehicle = 0;
    let vehicleYear = 0;
    let vehicleYearRange = 0;
    const unique = new Set();

    for (const id of ids) {
      try {
        const payload = await fetchProduct(id);
        const cars = payload?.cars || [];
        if (cars.length > 0) withFitment += 1;
        const links = buildFitmentListingLinks(cars);
        const s = summarizeFitmentListingLinks(links);
        vehicle += s.vehicle;
        vehicleYear += s.vehicleYear;
        vehicleYearRange += s.vehicleYearRange;
        for (const l of links) unique.add(l.href);
      } catch (e) {
        console.error(`skip ${id}:`, e.message);
      }
    }

    console.log("\n=== Coverage Report ===");
    console.log("| Metric | Count |");
    console.log("| ------ | ----: |");
    console.log(`| Products audited | ${ids.length} |`);
    console.log(`| Products with fitment | ${withFitment} |`);
    console.log(`| Vehicle links generated | ${vehicle} |`);
    console.log(`| VehicleYear links generated | ${vehicleYear} |`);
    console.log(`| VehicleYearRange links generated | ${vehicleYearRange} |`);
    console.log(`| Unique URLs emitted | ${unique.size} |`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
