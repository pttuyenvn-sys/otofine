#!/usr/bin/env node
/**
 * IMAGE-DIMENSION-IMPLEMENT-01 validation
 */
import fs from "node:fs";
import path from "node:path";
import {
  productImageDimensionProps,
  resolveProductImageDimensions,
} from "../lib/image/productImageDimensions.js";
import { toThumb100, toThumb400 } from "../lib/imageVariants.js";

const FRONTEND = path.resolve(import.meta.dirname, "..");
const API = process.env.ALT_VALIDATE_API || "http://127.0.0.1:5000/api";

const PRODUCT_SURFACES = [
  "components/pages/home/HomeImages.jsx",
  "components/seo/SeoListingProductImage.jsx",
  "components/pages/ProductDetail.jsx",
  "components/seo/SeoListingContent.jsx",
  "components/pages/home/HomeProductCard.jsx",
  "components/pages/home/HomeSearch.jsx",
  "components/seo/CategorySeoContent.jsx",
  "components/shopsite/ShopProductCard.jsx",
  "components/shopsite/ShopGallery.jsx",
  "components/shopsite/ShopRecentlyViewed.jsx",
  "components/products/ProductTable.jsx",
  "components/pages/products/ProductMobileCard.jsx",
  "components/popup/ProductImagePopup.jsx",
  "components/seo/seoArticleBodyEnhance.js",
  "components/pages/AdminProductModerationQueue.jsx",
  "components/moderation/ModerationDetailPanels.jsx",
  "components/moderation/ModerationReviewCard.jsx",
];

function shufflePick(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

const INDIRECT_WIRED = {
  "components/seo/SeoListingContent.jsx": "SeoListingProductImage",
  "components/pages/home/HomeProductCard.jsx": "ProductCardImage",
  "components/pages/home/HomeSearch.jsx": "SearchSuggestThumb",
};

function isSurfaceWired(rel) {
  const src = fs.readFileSync(path.join(FRONTEND, rel), "utf8");
  if (
    src.includes("productImageDimensionProps") ||
    src.includes("dimensionLayout") ||
    src.includes("dimensionAttrHtml")
  ) {
    return true;
  }
  const child = INDIRECT_WIRED[rel];
  return Boolean(child && src.includes(child));
}

async function main() {
  console.log("IMAGE-DIMENSION-IMPLEMENT-01 validation\n");

  const wired = PRODUCT_SURFACES.filter(isSurfaceWired);

  const remote = await fetch(`${API}/seo/sitemap-data`).then((r) => r.json());
  const products = remote.products || [];
  const sample = shufflePick(products, 100);

  let withDims = 0;
  const samples = [];

  for (const p of sample) {
    const original = p.image || `https://img.otofine.com/shops/1/${p.partNumber || "x"}.webp`;
    const cases = [
      { label: "original", src: original, layout: "square" },
      { label: "thumb400", src: toThumb400(original), layout: "thumb400" },
      { label: "thumb100", src: toThumb100(original), layout: "thumb100" },
      { label: "pdp-main", src: original, layout: "pdp-main" },
    ];

    for (const c of cases) {
      const dims = resolveProductImageDimensions({ src: c.src, layout: c.layout });
      const props = productImageDimensionProps({ src: c.src, layout: c.layout });
      const ok =
        dims &&
        Number.isFinite(dims.width) &&
        dims.width > 0 &&
        Number.isFinite(dims.height) &&
        dims.height > 0;
      if (ok) withDims += 1;
      if (samples.length < 6 && c.label === "thumb400") {
        samples.push({ id: p.id, ...props, layout: c.layout });
      }
    }
  }

  const totalChecks = sample.length * 4;
  const coveragePct = Number(((withDims / totalChecks) * 100).toFixed(1));
  const surfacePct = Number(((wired.length / PRODUCT_SURFACES.length) * 100).toFixed(1));

  const report = {
    productSurfacesTotal: PRODUCT_SURFACES.length,
    productSurfacesWired: wired.length,
    surfaceWiringPct: surfacePct,
    dimensionResolutionChecks: totalChecks,
    dimensionResolutionPass: withDims,
    dimensionCoveragePct: coveragePct,
    nextImageUsage: [
      "components/pages/home/header/HomeHeader.jsx (logo only)",
      "components/seo/SeoArticleEnriched.jsx (article hero — not product grid)",
    ],
    clsNotes: {
      before: "Product <img> tags lacked width/height; layout reserved only via CSS aspect-ratio after paint.",
      after:
        "Explicit width/height on product surfaces matching thumb_100 (100), thumb_400 (400), square cards (400), PDP main (4:3), gallery thumbs (72).",
      expected:
        "CLS should improve or hold steady — intrinsic aspect ratio now matches CSS slots before image decode.",
    },
    samples,
    missingSurfaces: PRODUCT_SURFACES.filter((rel) => !wired.includes(rel)),
  };

  console.log(JSON.stringify(report, null, 2));

  if (surfacePct < 95) {
    throw new Error(`Surface wiring ${surfacePct}% < 95%`);
  }
  if (coveragePct < 100) {
    throw new Error(`Dimension resolution ${coveragePct}% < 100%`);
  }

  console.log("\nPASS: IMAGE-DIMENSION-IMPLEMENT-01");
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exitCode = 1;
});
