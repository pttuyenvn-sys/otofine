const assert = require("assert");
const path = require("path");

const listing = require(path.resolve(__dirname, "../../components/pages/home/services/listingUrlState.js"));

const cases = [
  { slug: "/phu-tung-mazda-3-2024", expected: { brand: "Mazda", model: "3", year: "2024" } },
  { slug: "/phu-tung-mazda-6-2024", expected: { brand: "Mazda", model: "6", year: "2024" } },
  { slug: "/phu-tung-cx-5-2024", expected: { brand: "Cx", model: "5", year: "2024" } },
  { slug: "/phu-tung-i10-2024", expected: { brand: "I10", model: "", year: "2024" } }, // model may parse as i10 brand/model split
  { slug: "/phu-tung-q5-2024", expected: { brand: "Q5", model: "", year: "2024" } },
  { slug: "/phu-tung-x5-2024", expected: { brand: "X5", model: "", year: "2024" } },
  { slug: "/phu-tung-320i-2024", expected: { brand: "320i", model: "", year: "2024" } },
  { slug: "/phu-tung-c200-2024", expected: { brand: "C200", model: "", year: "2024" } },
  // Category + year: ensure trailing year never sticks to model.
  { slug: "/can-sau-toyota-vios-2020-tai-ha-noi", expected: { brand: "Toyota", model: "Vios", year: "2020" } },
];

let failed = 0;
for (const c of cases) {
  const out = listing.parseUrlState(c.slug, { categories: [], brands: [], locations: [], vehicleHot: null });
  try {
    assert.ok(out.brand && String(out.brand).toLowerCase().includes(String(c.expected.brand).toLowerCase().replace(/\s+/g, "")));
    if (c.expected.year) assert.strictEqual(String(out.year), String(c.expected.year));
    console.log("PASS parseUrlState", c.slug, "->", out.brand, out.model, out.year);
  } catch (err) {
    console.error("FAIL parseUrlState", c.slug, "got", out, "expect", c.expected, err && err.message);
    failed += 1;
  }
}

if (failed) process.exit(2);
else process.exit(0);

