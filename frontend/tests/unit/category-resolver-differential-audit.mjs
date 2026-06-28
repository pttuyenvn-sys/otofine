/**
 * ARCH-MP-03B.9F — Category resolver differential audit (production APIs only).
 * Run: node --experimental-loader ./tests/unit/alias-loader.mjs ./tests/unit/category-resolver-differential-audit.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";

const FRONTEND = path.resolve(import.meta.dirname, "../..");
const require = createRequire(path.join(FRONTEND, "package.json"));

process.env.NEXT_PUBLIC_API_URL = "https://otofine.com/api";

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
const {
  lookupCategoryByRequestSlug,
  fetchCategoryCatalog,
} = await import(path.join(FRONTEND, "lib/seo/buildCategoryOwnerPath.js"));

// Re-export internals via same module graph (production fetch, no mocks)
const resolveSeoModule = await import(
  path.join(FRONTEND, "lib/seo/resolveSeoEntity.js")
);

async function tryResolveCategoryEntity(slug, landing) {
  const normalized = String(slug || "").trim().toLowerCase();
  const lookup = await lookupCategoryByRequestSlug(normalized);
  if (lookup) {
    return {
      result: "lookupCategoryByRequestSlug HIT",
      kind: "category",
      categoryMeta: lookup,
    };
  }
  if (landing?.kind === "category") {
    return {
      result: "parseLandingSlug category (no catalog lookup)",
      kind: "category",
      landing,
    };
  }
  // isCanonicalCategoryLandingSlug — replicate via catalog rows
  const { canonicalSlugs } = await fetchCategoryCatalog();
  const isCanonical = canonicalSlugs.has(normalized);
  if (isCanonical) {
    const canonicalLookup = await lookupCategoryByRequestSlug(normalized);
    return {
      result: "isCanonicalCategoryLandingSlug TRUE",
      kind: "category",
      categoryMeta: canonicalLookup,
    };
  }
  return { result: "tryResolveCategoryEntity MISS → null", kind: null };
}

async function isCanonicalCategoryLandingSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  const { canonicalSlugs } = await fetchCategoryCatalog();
  return canonicalSlugs.has(s);
}

function summarizeEntity(entity) {
  const meta = entity?.categoryMeta || {};
  return {
    kind: entity?.kind,
    canonicalSlug: meta.canonicalSlug ?? null,
    canonicalName: meta.canonicalName ?? meta.categoryName ?? null,
    categoryId: meta.categoryId ?? meta.id ?? null,
    categoryMeta: entity?.categoryMeta ?? null,
    landingKind: entity?.landing?.kind ?? null,
    hasKnowledge: Boolean(entity?.knowledge),
    hasProductMatch: Boolean(entity?.productMatch),
    hasVehicleSeo: Boolean(entity?.vehicleSeo),
  };
}

async function auditSlug(slug) {
  const landing = await parseLandingSlug(slug);
  const lookup = await lookupCategoryByRequestSlug(slug);
  const isCanonical = await isCanonicalCategoryLandingSlug(slug);
  const tryCat = await tryResolveCategoryEntity(slug, landing);
  const entity = await resolveSeoEntity(slug);

  // Find catalog row
  const { rows } = await fetchCategoryCatalog();
  const row = rows.find(
    (r) => String(r.canonical_slug || "").toLowerCase() === slug,
  );

  return {
    slug,
    catalogRow: row
      ? {
          id: row.id ?? row.category_id ?? null,
          canonical_slug: row.canonical_slug,
          canonical_name: row.canonical_name,
          category_name: row.category_name,
        }
      : null,
    isCanonicalCategoryLandingSlug: isCanonical,
    lookupCategoryByRequestSlug: lookup,
    tryResolveCategoryEntity: tryCat,
    parseLandingSlug: {
      kind: landing?.kind,
      filters: landing?.filters ?? null,
      h1: landing?.h1 ?? null,
    },
    resolveSeoEntity: entity,
    resolveSeoEntitySummary: summarizeEntity(entity),
    pageWould404:
      entity.kind === "unknown" || entity.kind === "product_not_found",
    unknownSource:
      entity.kind === "unknown"
        ? tryCat.kind
          ? "unexpected"
          : "tryResolveCategoryEntity returned null → resolveSeoEntity falls through to unknown"
        : entity.kind === "product_not_found"
          ? "looksLikeProductSlug / getProductDetailCached miss"
          : null,
  };
}

console.log("API_BASE:", process.env.NEXT_PUBLIC_API_URL);
console.log("NO MOCKS — live production API\n");

const results = {};
for (const slug of SLUGS) {
  results[slug] = await auditSlug(slug);
  console.log(`\n${"=".repeat(72)}\nSLUG: ${slug}\n${"=".repeat(72)}`);
  console.log(JSON.stringify(results[slug], null, 2));
}

console.log("\n\n=== DIFF TABLE ===\n");
const pairs = [
  ["can-truoc-o-to", "ma-phanh-truoc-o-to", "Cản Trước vs Má Phanh Trước"],
  ["ket-nuoc-o-to", "thuoc-lai-o-to", "Két Nước vs Thước Lái"],
];

for (const [a, b, label] of pairs) {
  const ra = results[a];
  const rb = results[b];
  console.log(`--- ${label} ---`);
  console.log(
    JSON.stringify(
      {
        fail: {
          slug: a,
          entityKind: ra.resolveSeoEntitySummary.kind,
          pageWould404: ra.pageWould404,
          catalogId: ra.catalogRow?.id,
          lookupHit: Boolean(ra.lookupCategoryByRequestSlug),
          isCanonical: ra.isCanonicalCategoryLandingSlug,
          seoPageExists: null,
        },
        ok: {
          slug: b,
          entityKind: rb.resolveSeoEntitySummary.kind,
          pageWould404: rb.pageWould404,
          catalogId: rb.catalogRow?.id,
          lookupHit: Boolean(rb.lookupCategoryByRequestSlug),
          isCanonical: rb.isCanonicalCategoryLandingSlug,
        },
        deltas: {
          entityKind: ra.resolveSeoEntitySummary.kind !== rb.resolveSeoEntitySummary.kind,
          pageWould404: ra.pageWould404 !== rb.pageWould404,
          lookupHit:
            Boolean(ra.lookupCategoryByRequestSlug) !==
            Boolean(rb.lookupCategoryByRequestSlug),
          catalogRowMissing: !ra.catalogRow && Boolean(rb.catalogRow),
        },
      },
      null,
      2,
    ),
  );
}
