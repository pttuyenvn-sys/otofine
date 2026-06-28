const assert = require("assert");
const path = require("path");

const seo = require(path.resolve(__dirname, "../../components/pages/home/services/listingSeoState.js"));

function ok(msg) {
  console.log("PASS:", msg);
}

try {
  const t1 = seo.buildPageTitle({
    categoryName: "Má phanh",
    hasCategory: true,
    brand: "",
    model: "",
    year: "",
    location: "",
  });
  assert.strictEqual(t1, "Má phanh ô tô");
  ok("buildPageTitle category-only");

  const t2 = seo.buildPageTitle({
    categoryName: "",
    hasCategory: false,
    brand: "Mazda",
    model: "6",
    year: "2024",
    location: "Hà Nội",
  });
  assert.strictEqual(t2, "Phụ tùng Mazda 6 2024 tại Hà Nội");
  ok("buildPageTitle brand-model-year-location");

  console.log("SEO unit checks passed.");
} catch (err) {
  console.error("SEO unit tests failed:", err && err.message ? err.message : err);
  process.exitCode = 2;
}
