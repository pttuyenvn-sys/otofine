#!/usr/bin/env node
/**
 * IMAGE-ALT-VEHICLE-CONTEXT-ENHANCEMENT-01 validation
 */
import {
  buildProductImageAlt,
  normalizeFitmentForAlt,
  resolvePrimaryFitmentForAlt,
  resolveProductAltPartName,
  resolveProductAltPartNumber,
} from "../lib/seo/buildProductImageAlt.js";
import { pickPrimaryFitment } from "../lib/identity/buildProductIdentity.js";

const API = process.env.ALT_VALIDATE_API || "http://127.0.0.1:5000/api";

function shufflePick(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function classifySample(product) {
  const alt = buildProductImageAlt(product);
  const partName = resolveProductAltPartName(product);
  const partNumber = resolveProductAltPartNumber(product);
  const fitment = normalizeFitmentForAlt(resolvePrimaryFitmentForAlt(product));
  const issues = [];

  if (!alt || alt === "image") issues.push("empty_or_generic");
  if (partName) {
    const needle = partName.slice(0, Math.min(10, partName.length)).toLowerCase();
    if (!alt.toLowerCase().includes(needle)) issues.push("missing_name");
  }
  if (partNumber && !alt.includes(partNumber)) issues.push("missing_part_number");
  if (fitment.brand && !alt.toLowerCase().includes(fitment.brand.toLowerCase())) {
    issues.push("missing_brand");
  }
  if (fitment.model && !alt.toLowerCase().includes(fitment.model.toLowerCase())) {
    issues.push("missing_model");
  }
  if (fitment.yearRange) {
    const yearNeedle = fitment.yearRange.split("-")[0];
    if (yearNeedle && !alt.includes(yearNeedle)) issues.push("missing_year");
  }
  if (alt.length > 220) issues.push("too_long");

  return { alt, issues, partName, partNumber, fitment };
}

async function loadSitemapProducts() {
  const remote = await fetch(`${API}/seo/sitemap-data`).then((r) => r.json());
  return remote.products || [];
}

async function loadListingSample(n = 25) {
  const res = await fetch(`${API}/products?limit=${n}&page=1`).then((r) => r.json());
  return res.data || [];
}

async function main() {
  console.log("IMAGE-ALT-VEHICLE-CONTEXT-ENHANCEMENT-01 validation\n");

  const all = await loadSitemapProducts();
  const withFitment = all.filter((p) => pickPrimaryFitment(p.cars || []));
  const sample = shufflePick(withFitment.length ? withFitment : all, 100);

  const results = sample.map((product) => ({
    id: product.id,
    ...classifySample(product),
  }));

  const ok = results.filter((r) => r.issues.length === 0).length;
  const withPn = results.filter((r) => r.partNumber).length;
  const pnOk = results.filter(
    (r) => !r.partNumber || r.alt.includes(r.partNumber),
  ).length;
  const withFit = results.filter((r) => r.fitment.brand || r.fitment.model).length;
  const fitOk = results.filter((r) => {
    if (!r.fitment.brand && !r.fitment.model) return true;
    const brandOk = !r.fitment.brand || r.alt.toLowerCase().includes(r.fitment.brand.toLowerCase());
    const modelOk = !r.fitment.model || r.alt.toLowerCase().includes(r.fitment.model.toLowerCase());
    return brandOk && modelOk;
  }).length;

  const listing = await loadListingSample(25);
  const listingWithCars = listing.filter((p) => Array.isArray(p.cars) && p.cars.length).length;
  const listingFitAlt = listing.filter((p) => {
    const f = normalizeFitmentForAlt(resolvePrimaryFitmentForAlt(p));
    if (!f.brand && !f.model) return true;
    const alt = buildProductImageAlt(p);
    return (
      (!f.brand || alt.toLowerCase().includes(f.brand.toLowerCase())) &&
      (!f.model || alt.toLowerCase().includes(f.model.toLowerCase()))
    );
  }).length;

  const examples = {
    before: "Ăng ten đuôi cá - Mã 96210A9000SWP",
    after: [
      buildProductImageAlt({
        partName: "Má phanh trước",
        brand: "Toyota",
        model: "Vios",
        yearFrom: 2014,
        yearTo: 2020,
        partNumber: "04465-0D140",
      }),
      buildProductImageAlt({
        partName: "Lọc dầu",
        brand: "Honda",
        model: "City",
        yearFrom: 2014,
        yearTo: 2020,
        partNumber: "15400-RTA-003",
      }),
      buildProductImageAlt({
        partName: "Gương chiếu hậu phải",
        brand: "Kia",
        model: "Morning",
        yearFrom: 2011,
        yearTo: 2017,
        partNumber: "87620-1Y000",
      }),
    ],
  };

  console.log(
    JSON.stringify(
      {
        sampleSize: results.length,
        meaningfulCoveragePct: Number(((ok / results.length) * 100).toFixed(1)),
        partNumberCoveragePct: withPn ? Number(((pnOk / withPn) * 100).toFixed(1)) : 100,
        fitmentCoveragePct: withFit ? Number(((fitOk / withFit) * 100).toFixed(1)) : 100,
        listingSampleSize: listing.length,
        listingWithCarsField: listingWithCars,
        listingFitmentInAlt: listingFitAlt,
        issueCounts: results.reduce((acc, r) => {
          for (const issue of r.issues) acc[issue] = (acc[issue] || 0) + 1;
          return acc;
        }, {}),
        examples,
        samples: results.slice(0, 8).map((r) => ({
          id: r.id,
          alt: r.alt,
          issues: r.issues,
        })),
      },
      null,
      2,
    ),
  );

  const failed = results.filter((r) => r.issues.length > 0);
  if (failed.length > 0) {
    throw new Error(`${failed.length} samples failed validation`);
  }
  if (listing.length && listingWithCars < Math.min(5, listing.length)) {
    console.warn(
      `WARN: only ${listingWithCars}/${listing.length} listing rows include cars[] — ALT may lack fitment on some cards`,
    );
  }

  console.log("\nPASS: IMAGE-ALT-VEHICLE-CONTEXT-ENHANCEMENT-01");
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exitCode = 1;
});
