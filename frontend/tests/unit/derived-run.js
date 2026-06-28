const assert = require("assert");
const path = require("path");

const derived = require(path.resolve(__dirname, "../../components/pages/home/services/listingDerivedState.js"));

try {
  // dbCategoryName basic
  const cat = derived.computeDbCategoryName([{ canonical_name: "Má phanh", canonical_slug: "ma-phanh" }], "ma-phanh");
  assert.strictEqual(cat, "Má phanh");
  console.log("PASS: computeDbCategoryName basic");

  // dbLocationName basic
  const loc = derived.computeDbLocationName([{ id: 1, name: "TP Hà Nội", slug: "ha-noi" }], "ha-noi");
  assert.strictEqual(loc, "Hà Nội");
  console.log("PASS: computeDbLocationName basic");

  // buildUrlState
  const s = derived.buildUrlState({ category: "Má phanh", brand: "Mazda", model: "6", year: "2024", location: "Hà Nội" });
  assert.strictEqual(s.brand, "Mazda");
  console.log("PASS: buildUrlState basic");

  // popularQuickKeywords
  const pk = derived.computePopularQuickKeywords(["A", "B", "C", "D", "E"], ["X", "B", "Y"]);
  assert.deepStrictEqual(pk.slice(0, 4), ["A", "B", "C", "D"]);
  console.log("PASS: computePopularQuickKeywords basic");

  console.log("Derived helpers unit checks passed.");
} catch (err) {
  console.error("Derived unit tests failed:", err && err.message ? err.message : err);
  process.exitCode = 2;
}

