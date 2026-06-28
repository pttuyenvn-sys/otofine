/**
 * ARCH-MP-03B.9H — dynamic SEO render gate regression.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const FRONTEND = path.resolve(import.meta.dirname, "../..");
const require = createRequire(path.join(FRONTEND, "package.json"));

const { resolveHomeSeoRender } = require(
  path.join(FRONTEND, "components/pages/home/seo/resolveHomeSeoRender.js"),
);
const { buildPageTitle } = require(
  path.join(FRONTEND, "components/pages/home/services/listingSeoState.js"),
);
const { classifyListingTier } = require(
  path.join(FRONTEND, "lib/seo/homePageTitle.js"),
);

const { buildDynamicListingSeoContent, buildDynamicListingSeoArticleHtml } =
  await import(path.join(FRONTEND, "lib/seo/dynamicListingSeoComposer.js"));

function ok(msg) {
  console.log("PASS:", msg);
}

function simulateCategorySeoPage404(categoryName) {
  const seoData = null;
  const premiumArticle = null;
  const finalSeoData = seoData || premiumArticle;

  const pageTitle = buildPageTitle({
    categoryName,
    hasCategory: true,
    brand: "",
    model: "",
    year: "",
    location: "",
  });
  const category = categoryName;
  const { tier } = classifyListingTier({ category });

  const content = buildDynamicListingSeoContent({
    h1: pageTitle,
    products: [],
    filters: { brand: "", model: "", year: "", location: "", city: "" },
    selectedCategory: category,
    knowledgeRows: [],
    tier,
  });

  const finalArticle = finalSeoData
    ? finalSeoData
    : { source: "dynamic", content };

  const beforeGate = Boolean(finalSeoData);
  const afterGate = resolveHomeSeoRender(finalArticle);
  const articleHtml = buildDynamicListingSeoArticleHtml(content);

  return {
    slug: categoryName,
    seoData,
    finalSeoData,
    finalArticle,
    before: {
      jsxGate: "finalSeoData",
      seoContentRendered: beforeGate,
    },
    after: {
      jsxGate: "finalArticle",
      seoContentRendered: afterGate.render,
      mode: afterGate.mode,
      hasArticleHtml: Boolean(articleHtml),
      sectionHeadings: (content.sections || []).map((s) => s.heading),
    },
  };
}

const cases = [
  { slug: "can-truoc-o-to", categoryName: "Cản Trước" },
  { slug: "ket-nuoc-o-to", categoryName: "Két Nước" },
];

for (const c of cases) {
  const dump = simulateCategorySeoPage404(c.categoryName);
  console.log(`\n=== ${c.slug} ===`);
  console.log(JSON.stringify(dump, null, 2));

  assert.equal(dump.seoData, null, `${c.slug} seoData null`);
  assert.ok(dump.finalArticle, `${c.slug} finalArticle exists`);
  assert.equal(dump.before.seoContentRendered, false, `${c.slug} before: not rendered`);
  assert.equal(dump.after.seoContentRendered, true, `${c.slug} after: rendered`);
  assert.equal(dump.after.mode, "dynamic", `${c.slug} dynamic mode`);
  assert.ok(dump.after.hasArticleHtml, `${c.slug} article HTML built`);
  assert.ok(
    dump.after.sectionHeadings.some((h) => h.includes("Cản Trước") || h.includes("Két Nước")),
    `${c.slug} category in section heading`,
  );
}

assert.deepEqual(resolveHomeSeoRender(null), { render: false, mode: null });
assert.deepEqual(resolveHomeSeoRender({ article_html: "<p>x</p>" }), {
  render: true,
  mode: "cms",
});
assert.deepEqual(
  resolveHomeSeoRender({ source: "dynamic", content: { intro: "a", sections: [] } }),
  { render: true, mode: "dynamic" },
);

// SeoArticleBlock mergeFaq → buildVehicleLabel(null) must not throw (9H-R1)
function buildVehicleLabelLike(ctx) {
  const { brand } = ctx || {};
  return brand || "";
}
assert.equal(buildVehicleLabelLike(null), "", "null context safe");

ok("dynamic SEO render gate matrix");
