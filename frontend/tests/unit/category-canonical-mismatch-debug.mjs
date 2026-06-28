/**
 * ARCH-MP-03B.9C — debug dump for category canonical mismatch recovery.
 * Run: node --experimental-loader ./tests/unit/alias-loader.mjs ./tests/unit/category-canonical-mismatch-debug.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const FRONTEND = path.resolve(import.meta.dirname, "../..");
const require = createRequire(path.join(FRONTEND, "package.json"));

process.env.NEXT_PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://otofine.com/api";

const TARGETS = ["can-truoc-o-to", "ket-nuoc-o-to", "ma-phanh-truoc-o-to"];
const CATALOG_PATTERNS = ["can-truoc", "ket-nuoc", "ma-phanh-truoc"];

const { resolveSeoEntity } = await import(
  "/var/www/otofine/frontend/lib/seo/resolveSeoEntity.js"
);
const { parseLandingSlug } = await import(
  "/var/www/otofine/frontend/lib/seo/parseLandingSlug.js"
);
const { lookupCategoryByRequestSlug } = await import(
  "/var/www/otofine/frontend/lib/seo/buildCategoryOwnerPath.js"
);
const { fetchProductCategoryRows } = await import(
  "/var/www/otofine/frontend/lib/seo/fetchProductCategoryCatalog.server.js"
);
const listingUrlHelpers = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingUrlState.js",
));
const listingDerivedState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingDerivedState.js",
));
const listingSeoState = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingSeoState.js",
));

const { buildListingUrlFromIdentity, slugify } = listingUrlHelpers;
const { resolveCategoryCanonicalSlug, computeDbCategoryName } = listingDerivedState;

async function tryResolveCategoryEntity(slug) {
  const landing = await parseLandingSlug(slug);
  if (landing?.kind === "category" && landing?.categoryMeta) {
    return { kind: "category", categoryMeta: landing.categoryMeta, landing };
  }
  const lookup = await lookupCategoryByRequestSlug(slug);
  if (lookup) {
    return { kind: "category", categoryMeta: lookup, landing: null };
  }
  return { kind: "unknown", categoryMeta: null, landing };
}

function uiSlugFromH1(categoryName) {
  const h1 = listingSeoState.buildPageTitle({ categoryName, hasCategory: true });
  return String(slugify(h1) || "").replace(/^\//, "");
}

console.log("=== 1. RESOLVE DUMPS ===\n");
const rows = await fetchProductCategoryRows();

for (const slug of TARGETS) {
  const entity = await resolveSeoEntity(slug);
  const landing = await parseLandingSlug(slug);
  const lookup = await lookupCategoryByRequestSlug(slug);
  const tryCat = await tryResolveCategoryEntity(slug);

  console.log(`--- ${slug} ---`);
  console.log("resolveSeoEntity:", JSON.stringify({
    kind: entity?.kind,
    canonicalSlug: entity?.categoryMeta?.canonicalSlug,
    canonicalName: entity?.categoryMeta?.canonicalName,
    categoryId: entity?.categoryMeta?.categoryId ?? entity?.categoryMeta?.id,
  }, null, 2));
  console.log("parseLandingSlug:", JSON.stringify({
    kind: landing?.kind,
    canonicalSlug: landing?.categoryMeta?.canonicalSlug,
    canonicalName: landing?.categoryMeta?.canonicalName,
  }, null, 2));
  console.log("lookupCategoryByRequestSlug:", JSON.stringify(lookup, null, 2));
  console.log("tryResolveCategoryEntity:", JSON.stringify({
    kind: tryCat.kind,
    canonicalSlug: tryCat.categoryMeta?.canonicalSlug,
    canonicalName: tryCat.categoryMeta?.canonicalName,
  }, null, 2));

  const candidates = [];
  if (lookup) {
    candidates.push({
      requestSlug: slug,
      canonicalSlug: lookup.canonicalSlug,
      canonicalName: lookup.canonicalName,
      categoryId: lookup.categoryId ?? lookup.id ?? null,
    });
  }
  for (const row of rows) {
    const cs = String(row.canonical_slug || "").toLowerCase();
    if (cs === slug || cs.includes(slug.replace(/-o-to$/, ""))) {
      candidates.push({
        requestSlug: slug,
        canonicalSlug: cs,
        canonicalName: row.canonical_name || row.category_name,
        categoryId: row.id ?? row.category_id ?? null,
      });
    }
  }
  console.log("category candidates:", JSON.stringify(candidates, null, 2));
  console.log();
}

console.log("=== 3. CATALOG LIKE QUERY ===\n");
for (const pat of CATALOG_PATTERNS) {
  const hits = rows
    .filter((r) => String(r.canonical_slug || "").includes(pat))
    .slice(0, 20)
    .map((r) => ({
      id: r.id ?? r.category_id,
      canonical_slug: r.canonical_slug,
      canonical_name: r.canonical_name,
      category_name: r.category_name,
    }));
  console.log(`%${pat}% (${hits.length} rows):`, JSON.stringify(hits, null, 2));
  console.log();
}

console.log("=== 4. UI vs CANONICAL ===\n");
let mismatchCount = 0;
for (const slug of TARGETS) {
  const row = rows.find((r) => String(r.canonical_slug || "").toLowerCase() === slug);
  const categoryName = row?.canonical_name || row?.category_name || "";
  const canonicalSlug = String(row?.canonical_slug || "").toLowerCase();
  const uiH1Slug = uiSlugFromH1(categoryName);
  const uiLegacy = buildListingUrlFromIdentity({
    categoryName,
    hasCategory: true,
  }).replace(/^\//, "");
  const uiFixed = buildListingUrlFromIdentity({
    categoryName,
    hasCategory: true,
    canonicalSlug: resolveCategoryCanonicalSlug(rows, categoryName),
  });

  const mismatch = uiLegacy !== canonicalSlug;
  if (mismatch) mismatchCount += 1;

  console.log({
    categoryName,
    actualCanonicalSlug: canonicalSlug,
    uiGeneratedSlugLegacy: uiLegacy,
    uiGeneratedSlugFixed: uiFixed.replace(/^\//, ""),
    h1Slugify: uiH1Slug,
    mismatchLegacy: mismatch,
    fixedMatchesCanonical: uiFixed === `/${canonicalSlug}`,
  });
}

console.log("\n=== 5. RESOLUTION ASSERT ===\n");
for (const slug of TARGETS) {
  const entity = await resolveSeoEntity(slug);
  assert.notEqual(entity.kind, "unknown", `${slug} must not be unknown`);
  assert.equal(entity.kind, "category", `${slug} must be category`);
  console.log("OK resolve", slug, "->", entity.kind);
}

if (mismatchCount === 0) {
  console.log("\nNote: legacy H1 slugify already matches canonical for all 3 targets.");
} else {
  console.log(`\n${mismatchCount} target(s) had legacy H1 slugify mismatch (fixed via canonicalSlug).`);
}
