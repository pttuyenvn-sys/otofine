/**
 * IMAGE-ALT-COVERAGE-IMPLEMENT-01 — validate meaningful product image ALT.
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildProductImageAlt,
  resolveProductAltName,
  resolveProductAltPartNumber,
} from "../lib/seo/buildProductImageAlt.js";

const API = process.env.ALT_VALIDATE_API || "http://127.0.0.1:5000/api";
const FRONTEND = path.resolve(import.meta.dirname, "..");

function classifyAlt(alt, product) {
  const text = String(alt ?? "").trim();
  const name = resolveProductAltName(product);
  const pn = resolveProductAltPartNumber(product);

  if (!text) return "empty";
  if (text === "Phụ tùng ô tô" && !name) return "fallback";
  if (name && !text.toLowerCase().includes(name.slice(0, Math.min(12, name.length)).toLowerCase())) {
    return "missing_name";
  }
  if (pn && !text.includes(pn)) return "missing_part_number";
  return "ok";
}

function scanFile(relPath, patterns) {
  const full = path.join(FRONTEND, relPath);
  const src = fs.readFileSync(full, "utf8");
  const hits = [];
  for (const pattern of patterns) {
    const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, "g");
    let m;
    while ((m = re.exec(src)) !== null) hits.push(m[0]);
  }
  return hits.length;
}

async function sampleProducts(n = 50) {
  const remote = await fetch(`${API}/seo/sitemap-data`).then((r) => r.json());
  const products = (remote.products || []).slice(0, n);
  return products.map((p) => ({
    product: p,
    alt: buildProductImageAlt(p),
    class: classifyAlt(buildProductImageAlt(p), p),
  }));
}

async function main() {
  console.log("IMAGE-ALT-COVERAGE-IMPLEMENT-01 validation\n");

  const before = {
    seoListingEmptyAlt: 1,
    homeCardNameOnly: 1,
    shopCardNameOnly: 1,
    pdpThumbEmpty: 1,
    searchSuggestEmpty: 1,
  };

  const productSurfaceEmptyAlt = scanFile("components/seo/SeoListingContent.jsx", [/alt=""/]);
  const homeCardUsesHelper = fs
    .readFileSync(path.join(FRONTEND, "components/pages/home/HomeProductCard.jsx"), "utf8")
    .includes("buildProductImageAlt");
  const shopCardUsesHelper = fs
    .readFileSync(path.join(FRONTEND, "components/shopsite/ShopProductCard.jsx"), "utf8")
    .includes("buildProductImageAlt");
  const pdpUsesHelper = fs
    .readFileSync(path.join(FRONTEND, "components/pages/ProductDetail.jsx"), "utf8")
    .includes("buildProductImageAlt");

  const samples = await sampleProducts(50);
  const ok = samples.filter((s) => s.class === "ok" || s.class === "fallback").length;
  const withPn = samples.filter((s) => resolveProductAltPartNumber(s.product)).length;
  const pnInAlt = samples.filter(
    (s) =>
      resolveProductAltPartNumber(s.product) &&
      String(s.alt).includes(resolveProductAltPartNumber(s.product)),
  ).length;

  const emptyGenerated = samples.filter((s) => s.class === "empty").length;
  const missingPn = samples.filter((s) => s.class === "missing_part_number").length;

  const coveragePct = ((ok / samples.length) * 100).toFixed(1);

  console.log(
    JSON.stringify(
      {
        codeAudit: {
          seoListingEmptyAltInSource: productSurfaceEmptyAlt,
          homeCardUsesHelper,
          shopCardUsesHelper,
          pdpUsesHelper,
        },
        beforeEstimate: before,
        after: {
          sampleSize: samples.length,
          meaningfulAltCoveragePct: Number(coveragePct),
          emptyAltCount: emptyGenerated,
          missingPartNumberInAlt: missingPn,
          productsWithPartNumber: withPn,
          partNumberPresentInAlt: pnInAlt,
        },
        samples: samples.slice(0, 5).map((s) => ({
          alt: s.alt,
          partNumber: resolveProductAltPartNumber(s.product),
          class: s.class,
        })),
      },
      null,
      2,
    ),
  );

  if (productSurfaceEmptyAlt > 0) throw new Error("SeoListingContent still has alt=\"\"");
  if (!homeCardUsesHelper || !shopCardUsesHelper || !pdpUsesHelper) {
    throw new Error("Helper not wired on key surfaces");
  }
  if (emptyGenerated > 0) throw new Error("Generated ALT samples contain empty values");
  if (withPn > 0 && pnInAlt < withPn) {
    throw new Error("Some products with part numbers missing Mã in ALT");
  }

  console.log("\nPASS: IMAGE-ALT-COVERAGE-IMPLEMENT-01");
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exitCode = 1;
});
