/**
 * ARCH-MP-03B.9B-FIX — regression tests:
 * Category + Brand + Model + Year (+ Location) must preserve `year` and keep `model` clean.
 */

import assert from "node:assert/strict";

const LOADER = "/var/www/otofine/frontend/tests/unit/alias-loader.mjs";
const SELF = import.meta.url;

function ok(msg) {
  console.log("PASS:", msg);
}

// NOTE: This script must be run with the alias loader:
//   node --experimental-loader tests/unit/alias-loader.mjs tests/unit/seo-cbmy-year-regression-run.mjs
// The npm script already does this.
if (!process.execArgv.some((x) => String(x).includes(LOADER))) {
  console.warn(
    "WARN: run with loader: node --experimental-loader tests/unit/alias-loader.mjs tests/unit/seo-cbmy-year-regression-run.mjs",
  );
}

const { resolveSeoEntity } = await import(
  "/var/www/otofine/frontend/lib/seo/resolveSeoEntity.js"
);

const cases = [
  { slug: "can-sau-toyota-vios-2020", year: "2020" },
  { slug: "can-sau-toyota-vios-2020-tai-ha-noi", year: "2020" },
  { slug: "ma-phanh-toyota-vios-2017", year: "2017" },
  { slug: "ma-phanh-toyota-vios-2017-tai-ha-noi", year: "2017" },
];

let failed = 0;

for (const c of cases) {
  try {
    const e = await resolveSeoEntity(c.slug);
    assert.equal(e?.kind, "category", `${c.slug} kind`);
    const meta = e?.categoryMeta || {};

    assert.equal(meta.cbmModel, "Vios", `${c.slug} model`);
    assert.equal(meta.cbmYear, c.year, `${c.slug} year`);

    assert.notEqual(meta.cbmModel, `Vios ${c.year}`, `${c.slug} model not appended`);
    assert.ok(!String(meta.cbmModel || "").includes("2017"), `${c.slug} model no 2017`);
    assert.ok(!String(meta.cbmModel || "").includes("2020"), `${c.slug} model no 2020`);

    console.log("PASS resolveSeoEntity", c.slug, "->", meta.cbmModel, meta.cbmYear);
  } catch (err) {
    failed += 1;
    console.error("FAIL resolveSeoEntity", c.slug, err?.message ?? err);
  }
}

if (failed) {
  process.exitCode = 2;
} else {
  ok("CBMY category+year regression matrix");
}

