/**
 * ARCH-MP-03B.9E — Category SEO content gate audit trace.
 * Run: node --experimental-loader ./tests/unit/alias-loader.mjs ./tests/unit/category-seo-content-gate-audit.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";

const FRONTEND = path.resolve(import.meta.dirname, "../..");
const require = createRequire(path.join(FRONTEND, "package.json"));

process.env.NEXT_PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://otofine.com/api";

const SLUGS = [
  "can-truoc-o-to",
  "ket-nuoc-o-to",
  "ma-phanh-truoc-o-to",
  "thuoc-lai-o-to",
];

const { resolveSeoEntity } = await import(
  path.join(FRONTEND, "lib/seo/resolveSeoEntity.js")
);
const { parseLandingSlug } = await import(
  path.join(FRONTEND, "lib/seo/parseLandingSlug.js")
);
const { loadPartSeoPage } = await import(
  path.join(FRONTEND, "lib/seo/loadPartSeoPage.server.js")
);
const { lookupCategoryByRequestSlug, fetchCategoryCatalog } = await import(
  path.join(FRONTEND, "lib/seo/buildCategoryOwnerPath.js")
);

function pageJsNotFoundGate(entity) {
  if (entity.kind === "product_not_found" || entity.kind === "unknown") {
    return { would404: true, gate: "page.js:199-200 entity.kind" };
  }
  return { would404: false, gate: null };
}

function seoContentGate(entity) {
  // Hypothesis B: SEO article required for render
  const checks = {
    requiresSeoPage: false,
    requiresKnowledge: false,
    requiresPremiumArticle: false,
  };
  // page.js has no such gate — document explicitly
  return checks;
}

async function traceSlug(slug, { label = "live" } = {}) {
  const entity = await resolveSeoEntity(slug);
  const landing = await parseLandingSlug(slug);
  const lookup = await lookupCategoryByRequestSlug(slug);
  const seoPage = await loadPartSeoPage(slug);
  const notFoundGate = pageJsNotFoundGate(entity);

  const dump = {
    label,
    slug,
    entityKind: entity.kind,
    would404: notFoundGate.would404,
    notFoundGate: notFoundGate.gate,
    categoryMeta: entity.categoryMeta
      ? {
          canonicalSlug: entity.categoryMeta.canonicalSlug,
          canonicalName: entity.categoryMeta.canonicalName,
          isCbmy: entity.categoryMeta.isCbmy,
        }
      : null,
    landingKind: landing?.kind ?? null,
    lookupHit: Boolean(lookup),
    seoPage: seoPage
      ? {
          hasArticleHtml: Boolean(
            seoPage.article_html || seoPage?.seoContent?.articleHtml,
          ),
          keys: Object.keys(seoPage).slice(0, 8),
        }
      : null,
    knowledgePage: entity.kind === "knowledge" ? Boolean(entity.knowledge) : null,
    article: entity.kind === "knowledge" ? "via entity.knowledge" : null,
    premiumArticle: "client-only (Home.jsx fetch /seo-page) — not SSR gate",
    dynamicArticle: "client-only (buildDynamicListingSeoContent fallback)",
    seoContentGate: seoContentGate(entity),
    rootCauseClass:
      notFoundGate.would404 && entity.kind === "unknown"
        ? "A.category-resolver"
        : notFoundGate.would404
          ? `A.${entity.kind}`
          : "none",
  };

  return dump;
}

console.log("=== page.js notFound() gates ===");
console.log(
  JSON.stringify(
    [
      "generateMetadata:112 — entity.kind === product_not_found",
      "SlugHomePage:199-200 — entity.kind === product_not_found || unknown",
      "NO gate on seoPage / knowledge / article / premiumArticle",
    ],
    null,
    2,
  ),
);

console.log("\n=== LIVE CATALOG TRACE ===\n");
for (const slug of SLUGS) {
  const dump = await traceSlug(slug);
  console.log(JSON.stringify(dump, null, 2));
  console.log();
}

// Simulate catalog outage — reproduces 404 when category resolver cannot load rows
console.log("=== SIMULATED /product-categories OUTAGE ===\n");
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("/product-categories")) {
    return { ok: false, status: 503, json: async () => null };
  }
  return realFetch(url, opts);
};

for (const slug of ["can-truoc-o-to", "ket-nuoc-o-to"]) {
  const dump = await traceSlug(slug, { label: "catalog-outage" });
  console.log(JSON.stringify(dump, null, 2));
  console.log();
}

globalThis.fetch = realFetch;

const { rows } = await fetchCategoryCatalog();
console.log(`=== catalog row count: ${rows.length} ===`);
