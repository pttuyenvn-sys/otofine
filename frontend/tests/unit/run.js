const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

(async () => {
  const modPath = path.resolve(__dirname, "../../components/pages/home/services/listingUrlState.js");
  const listing = require(modPath);

  const ok = (msg) => console.log("PASS:", msg);

  try {
    // slugify tests
    assert.strictEqual(listing.slugify("Mazda 6 2024"), "mazda-6-2024");
    ok("slugify basic");

    // buildPathFromState
    const p = listing.buildPathFromState({ category: "", brand: "Mazda", model: "6", year: "2024" });
    assert.strictEqual(p, "/phu-tung-mazda-6-2024");
    ok("buildPathFromState produces expected listing slug");

    // parseUrlState basic
    const parsed = listing.parseUrlState("/phu-tung-mazda-6-2024", { categories: [], brands: [], locations: [], vehicleHot: null });
    assert.strictEqual(parsed.brand, "Mazda");
    assert.strictEqual(parsed.model, "6");
    assert.strictEqual(parsed.year, "2024");
    ok("parseUrlState parses brand/model/year for numeric model route");

    console.log("All unit checks passed.");
  } catch (err) {
    console.error("Unit tests failed:", err && err.message ? err.message : err);
    process.exitCode = 2;
  }
})();
