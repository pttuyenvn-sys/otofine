/**
 * ARCH-MP-03B.9B — category -o-to route recovery + regression matrix.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const FRONTEND = path.resolve(import.meta.dirname, "../..");
const require = createRequire(path.join(FRONTEND, "package.json"));

process.env.NEXT_PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://otofine.com/api";

const { resolveSeoEntity } = await import(
  "/var/www/otofine/frontend/lib/seo/resolveSeoEntity.js"
);
const { parseLandingSlug } = await import(
  "/var/www/otofine/frontend/lib/seo/parseLandingSlug.js"
);

function ok(msg) {
  console.log("PASS:", msg);
}

function dumpEntity(slug, landing, entity) {
  const meta = entity?.categoryMeta || {};
  return {
    slug,
    parseLandingKind: landing?.kind,
    entityKind: entity?.kind,
    canonicalSlug: meta.canonicalSlug || null,
    canonicalName: meta.canonicalName || meta.categoryName || null,
    categoryId: meta.categoryId ?? meta.id ?? null,
  };
}

async function resolve(slug) {
  const landing = await parseLandingSlug(slug);
  const entity = await resolveSeoEntity(slug);
  return { landing, entity, dump: dumpEntity(slug, landing, entity) };
}

const categoryOnly = [
  { slug: "ket-nuoc-o-to", name: "Két Nước" },
  { slug: "can-truoc-o-to", name: "Cản Trước" },
  { slug: "ma-phanh-truoc-o-to", name: "Má Phanh Trước" },
  { slug: "bugi-o-to", name: "Bugi" },
  { slug: "ma-phanh-o-to", name: "Má Phanh" },
];

let failed = 0;

for (const c of categoryOnly) {
  try {
    const { landing, entity, dump } = await resolve(c.slug);
    assert.equal(landing.kind, "category", `${c.slug} parseLandingSlug`);
    assert.equal(entity.kind, "category", `${c.slug} entity.kind`);
    assert.equal(dump.canonicalSlug, c.slug, `${c.slug} canonicalSlug`);
    assert.ok(
      String(dump.canonicalName || "").includes(c.name.split(" ")[0]),
      `${c.slug} canonicalName`,
    );
    console.log("PASS category-only", JSON.stringify(dump));
  } catch (err) {
    failed += 1;
    console.error("FAIL category-only", c.slug, err?.message ?? err);
  }
}

const regression = [
  { slug: "ma-phanh-o-to-tai-ha-noi", label: "category+location" },
  { slug: "phu-tung-toyota-vios", label: "CBM" },
  { slug: "ket-nuoc-toyota-vios-2016-tai-ha-noi", label: "CBMY+location" },
  { slug: "can-sau-toyota-vios-2020", label: "CBMY" },
];

for (const c of regression) {
  try {
    const { entity } = await resolve(c.slug);
    assert.notEqual(entity.kind, "unknown", `${c.label} not unknown`);
    assert.notEqual(entity.kind, "product_not_found", `${c.label} not 404 product`);
    console.log("PASS regression", c.label, c.slug, "->", entity.kind);
  } catch (err) {
    failed += 1;
    console.error("FAIL regression", c.label, c.slug, err?.message ?? err);
  }
}

// Simulate primary catalog outage; canonical fallback must still resolve -o-to routes.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("/product-categories") && !u.includes("/canonical")) {
    return { ok: false, status: 503, json: async () => null };
  }
  return realFetch(url, opts);
};

for (const c of categoryOnly) {
  try {
    const { landing, entity, dump } = await resolve(c.slug);
    assert.equal(landing.kind, "category", `${c.slug} fallback parseLandingSlug`);
    assert.equal(entity.kind, "category", `${c.slug} fallback entity.kind`);
    assert.equal(dump.canonicalSlug, c.slug, `${c.slug} fallback canonicalSlug`);
    console.log("PASS fallback", JSON.stringify(dump));
  } catch (err) {
    failed += 1;
    console.error("FAIL fallback", c.slug, err?.message ?? err);
  }
}

globalThis.fetch = realFetch;

// Category URL must use DB canonical_slug (not H1 slugify) when catalog provides it.
const { fetchProductCategoryRows } = await import(
  "/var/www/otofine/frontend/lib/seo/fetchProductCategoryCatalog.server.js"
);
const listingUrlHelpers = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingUrlState.js",
));
const listingDerived = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingDerivedState.js",
));
const { buildListingUrlFromIdentity } = listingUrlHelpers;

const catalogRows = await fetchProductCategoryRows();
for (const c of [
  { slug: "can-truoc-o-to", name: "Cản Trước" },
  { slug: "ket-nuoc-o-to", name: "Két Nước" },
  { slug: "ma-phanh-truoc-o-to", name: "Má Phanh Trước" },
]) {
  try {
    const row = catalogRows.find(
      (r) => String(r.canonical_slug || "").toLowerCase() === c.slug,
    );
    assert.ok(row, `${c.slug} catalog row`);
    const categoryName = String(row.canonical_name || row.category_name || "").trim();
    const canonicalSlug = listingDerived.resolveCategoryCanonicalSlug(catalogRows, categoryName);
    assert.equal(canonicalSlug, c.slug, `${c.slug} resolveCategoryCanonicalSlug`);
    const pathBuilt = buildListingUrlFromIdentity({
      categoryName,
      hasCategory: true,
      canonicalSlug,
    });
    assert.equal(pathBuilt, `/${c.slug}`, `${c.slug} canonical path`);
    console.log("PASS canonical-url", c.slug, "->", pathBuilt);
  } catch (err) {
    failed += 1;
    console.error("FAIL canonical-url", c.slug, err?.message ?? err);
  }
}

if (failed) {
  process.exitCode = 2;
} else {
  ok("category route recovery matrix");
}
