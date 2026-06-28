/**
 * ARCH-MP-03B.9G-A — seo-page 404 → finalArticle audit dump
 * Run: node --experimental-loader ./tests/unit/alias-loader.mjs ./tests/unit/seo-page-404-finalarticle-audit.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";

const FRONTEND = path.resolve(import.meta.dirname, "../..");
const require = createRequire(path.join(FRONTEND, "package.json"));

const { resolveHomeSeoRender } = require(
  path.join(FRONTEND, "components/pages/home/seo/resolveHomeSeoRender.js"),
);

const { buildDynamicListingSeoContent } = await import(
  path.join(FRONTEND, "lib/seo/dynamicListingSeoComposer.js")
);
const { buildPageTitle } = require(
  path.join(FRONTEND, "components/pages/home/services/listingSeoState.js"),
);
const { classifyListingTier } = require(
  path.join(FRONTEND, "lib/seo/homePageTitle.js"),
);

const SLUGS = [
  { slug: "can-truoc-o-to", categoryName: "Cản Trước" },
  { slug: "ket-nuoc-o-to", categoryName: "Két Nước" },
];

// Mirrors Home.jsx when /api/seo-page returns 404:
//   setSeoData(null) → finalSeoData = null → finalArticle useMemo branch
function simulateSeoPage404(categoryName) {
  const seoData = null;
  const premiumArticle = null;
  const finalSeoData = seoData || premiumArticle;

  const brand = "";
  const model = "";
  const year = "";
  const location = "";
  const category = categoryName;

  const pageTitle = buildPageTitle({
    categoryName,
    hasCategory: true,
    brand,
    model,
    year,
    location,
  });

  const { tier } = classifyListingTier({
    category,
    brand,
    model,
    year,
    location,
  });

  const dynamicListingSeoComposer = buildDynamicListingSeoContent({
    h1: pageTitle,
    products: [],
    filters: { brand, model, year, location, city: location },
    selectedCategory: categoryName,
    knowledgeRows: [],
    tier,
  });

  const finalArticle = finalSeoData
    ? finalSeoData
    : {
        source: "dynamic",
        content: dynamicListingSeoComposer,
      };

  return {
    seoData,
    finalSeoData,
    pageTitle,
    tier,
    dynamicListingSeoComposer,
    finalArticle,
    finalArticleIsNull: finalArticle == null,
    jsxWouldRenderSeoBlock: resolveHomeSeoRender(finalArticle).render,
    seoRenderMode: resolveHomeSeoRender(finalArticle).mode,
    note: "Home.jsx gates on finalArticle → resolveHomeSeoRender",
  };
}

console.log("=== Home.jsx render gate (line 1413) ===");
console.log("{finalArticle && <SeoContent data={finalArticle} />}");
console.log("resolveHomeSeoRender: CMS when seoData, dynamic when absent\n");

for (const { slug, categoryName } of SLUGS) {
  const dump = simulateSeoPage404(categoryName);
  console.log("=".repeat(60));
  console.log(`SLUG: ${slug} (/api/seo-page → 404 simulated)`);
  console.log("=".repeat(60));
  console.log(JSON.stringify(dump, null, 2));
  console.log();
}
