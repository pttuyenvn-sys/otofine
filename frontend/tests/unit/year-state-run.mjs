import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const FRONTEND = "/var/www/otofine/frontend";
const require = createRequire(path.join(FRONTEND, "package.json"));

const {
  splitSeoYearFromLegacy,
  formatSeoYearRange,
  deriveSelectedYear,
  hydrateControllerYearFields,
} = require(path.join(FRONTEND, "components/pages/home/services/yearState.js"));

function ok(msg) {
  console.log("PASS:", msg);
}

try {
  assert.deepStrictEqual(splitSeoYearFromLegacy("2014"), {
    yearFrom: 2014,
    yearTo: 2014,
  });
  assert.deepStrictEqual(splitSeoYearFromLegacy("2014-2020"), {
    yearFrom: 2014,
    yearTo: 2020,
  });
  assert.deepStrictEqual(splitSeoYearFromLegacy(""), {
    yearFrom: null,
    yearTo: null,
  });
  ok("splitSeoYearFromLegacy single, range, empty");

  assert.strictEqual(formatSeoYearRange(2014, 2020), "2014-2020");
  assert.strictEqual(formatSeoYearRange(2014, 2014), "2014");
  assert.strictEqual(formatSeoYearRange(null, null), "");
  ok("formatSeoYearRange");

  assert.strictEqual(deriveSelectedYear(2014), 2014);
  assert.strictEqual(deriveSelectedYear("2014"), 2014);
  assert.strictEqual(deriveSelectedYear("2014-2020"), null);
  assert.strictEqual(deriveSelectedYear(null), null);
  ok("deriveSelectedYear");

  assert.deepStrictEqual(hydrateControllerYearFields("2014"), {
    year: "2014",
    yearFrom: 2014,
    yearTo: 2014,
  });
  assert.deepStrictEqual(hydrateControllerYearFields("2014-2020"), {
    year: "2014-2020",
    yearFrom: 2014,
    yearTo: 2020,
  });
  assert.deepStrictEqual(hydrateControllerYearFields(""), {
    year: "",
    yearFrom: null,
    yearTo: null,
  });
  ok("controller hydration from legacy year");

  console.log("Year state unit checks passed.");
} catch (err) {
  console.error("Year state tests failed:", err?.message ?? err);
  process.exitCode = 2;
}
