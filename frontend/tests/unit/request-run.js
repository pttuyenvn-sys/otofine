const assert = require("assert");
const path = require("path");

const FRONTEND = path.resolve(__dirname, "../..");
const req = require(path.join(
  FRONTEND,
  "components/pages/home/services/listingRequestState.js",
));

function ok(msg) {
  console.log("PASS:", msg);
}

function paramsYear(queryString) {
  const params = new URLSearchParams(queryString);
  return params.get("year");
}

try {
  const p = req.buildProductListParams({
    category: "A",
    brand: "B",
    model: "C",
    year: "2020",
    location: "D",
    keyword: "x",
    page: 2,
    sort: "newest",
  });
  assert.ok(p.includes("category=A"));
  assert.ok(p.includes("brand=B"));
  assert.strictEqual(paramsYear(p), "2020");
  ok("buildProductListParams single year URL");

  const range = req.buildProductListParams({
    brand: "Kia",
    model: "Sedona",
    year: "2014-2020",
    page: 1,
    sort: "popular",
  });
  assert.strictEqual(paramsYear(range), null);
  ok("buildProductListParams range URL omits year query");

  const picked = req.buildProductListParams({
    brand: "Toyota",
    model: "Vios",
    year: "2025",
    page: 1,
    sort: "popular",
  });
  assert.strictEqual(paramsYear(picked), "2025");
  ok("buildProductListParams pick year from URL SSOT");

  const facet = req.buildFilterCategoriesParams({
    brand: "Mazda",
    model: "3",
    year: "2019",
    location: "Hà Nội",
  });
  assert.strictEqual(paramsYear(facet), "2019");
  ok("buildFilterCategoriesParams facet year");

  const facetRange = req.buildFilterCategoriesParams({
    brand: "Kia",
    model: "Sedona",
    year: "2014-2020",
  });
  assert.strictEqual(paramsYear(facetRange), null);
  ok("buildFilterCategoriesParams range omits year");

  const loc = req.buildLocationsParams({
    category: "phanh",
    brand: "Honda",
    model: "City",
    year: "2017",
    keyword: "ma phanh",
  });
  assert.strictEqual(paramsYear(loc), "2017");
  ok("buildLocationsParams location facet year");

  const s = req.buildSuggestParams({
    q: "loc gio",
    brand: "Mazda",
    model: "3",
    year: "2015",
    page: 1,
  });
  assert.ok(s.includes("q="));
  assert.ok(s.includes("brand=Mazda"));
  assert.strictEqual(paramsYear(s), "2015");
  ok("buildSuggestParams suggest year");

  const categorySuggest = req.buildSuggestParams({
    q: "loc gio",
    brand: "Mazda",
    model: "3",
    year: "2014-2020",
    page: 1,
    limit: 12,
  });
  assert.strictEqual(paramsYear(categorySuggest), null);
  ok("buildSuggestParams product suggest omits range year");

  const sidebarSuggest = req.buildCategorySidebarSuggestParams({
    q: "loc gio",
    brand: "Mazda",
    model: "3",
    year: "2014-2020",
    page: 1,
    limit: 12,
  });
  assert.strictEqual(paramsYear(sidebarSuggest), "2014-2020");
  ok("buildCategorySidebarSuggestParams keeps range year");

  const previewParams = req.buildSuggestCategoryProductPreviewParams({
    category: "Giảm Xóc Trước Phải",
    brand: "Toyota",
    model: "Vios",
    year: "2014-2020",
    page: 1,
  });
  const preview = new URLSearchParams(previewParams);
  assert.strictEqual(preview.get("category"), "Giảm Xóc Trước Phải");
  assert.strictEqual(preview.get("brand"), "Toyota");
  assert.strictEqual(preview.get("model"), "Vios");
  assert.strictEqual(preview.get("year"), "2014-2020");
  assert.strictEqual(preview.get("q"), null);
  assert.strictEqual(preview.get("keyword"), null);
  ok("buildSuggestCategoryProductPreviewParams category intent preview");

  const categoryCtx = require(path.join(
    FRONTEND,
    "components/pages/home/services/categorySuggestVehicleContext.js",
  ));
  assert.strictEqual(
    categoryCtx.formatCategorySuggestLabel("Càng A Phải", {
      brand: "Toyota",
      model: "Vios",
    }),
    "Càng A Phải Toyota Vios",
  );
  assert.strictEqual(
    categoryCtx.buildCategorySuggestHref(
      { canonical_name: "Càng A Phải", canonical_slug: "cang-a-phai-o-to" },
      { brand: "Toyota", model: "Vios" },
    ),
    "/cang-a-phai-toyota-vios",
  );
  ok("category suggest vehicle label + href");

  assert.strictEqual(req.resolveListingQueryYear({ year: "2014" }), "2014");
  assert.strictEqual(req.resolveListingQueryYear({ year: "2014-2020" }), "");
  assert.strictEqual(req.resolveListingQueryYear({ year: "2017" }), "2017");
  assert.strictEqual(req.resolveListingQueryYear({ year: "" }), "");
  ok("resolveListingQueryYear from URL year only");

  const collapsedPick = req.buildProductListParams({
    brand: "Toyota",
    model: "Vios",
    year: "2017",
    page: 1,
    sort: "popular",
  });
  assert.strictEqual(paramsYear(collapsedPick), "2017");
  ok("range pick collapsed to single-year URL");

  console.log("Request helpers unit checks passed.");
} catch (err) {
  console.error(
    "Request unit tests failed:",
    err && err.message ? err.message : err,
  );
  process.exitCode = 2;
}
