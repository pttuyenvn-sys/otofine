import assert from "node:assert/strict";
import { normalizeListingIdentity } from "../../lib/listing/normalizeListingIdentity.ts";
import { buildListingDisplayLabel } from "../../lib/listing/buildListingDisplayLabel.ts";
import { buildListingSlug, buildListingPath } from "../../lib/listing/buildListingSlug.ts";
import { buildListingQuery, buildListingQueryString } from "../../lib/listing/buildListingQuery.ts";
import { buildListingSeo } from "../../lib/listing/buildListingSeo.ts";

function ok(msg) {
  console.log("PASS:", msg);
}

try {
  const cbmy = normalizeListingIdentity({
    category: "Cản trước",
    brand: "Kia",
    model: "Sedona",
    year: "2014-2020",
  });
  assert.strictEqual(
    buildListingDisplayLabel(cbmy),
    "Cản trước Kia Sedona 2014-2020",
  );
  assert.strictEqual(
    buildListingSlug(cbmy),
    "can-truoc-kia-sedona-2014-2020",
  );
  ok("display label + slug for CBMY range");

  const bm = normalizeListingIdentity({ brand: "Kia", model: "Sedona" });
  assert.strictEqual(buildListingDisplayLabel(bm), "Phụ tùng Kia Sedona");
  ok("display label for brand+model");

  const withUserYear = normalizeListingIdentity({
    category: "Cản trước",
    brand: "Kia",
    model: "Sedona",
    yearFrom: 2014,
    yearTo: 2020,
    selectedYear: 2014,
  });
  const query = buildListingQuery(withUserYear);
  assert.strictEqual(query.year, 2014);
  assert.strictEqual(cbmy.selectedYear, null);
  assert.ok(!buildListingQueryString(cbmy).includes("year="));
  assert.ok(buildListingQueryString(withUserYear).includes("year=2014"));
  ok("selectedYear drives query; SEO range does not");

  const seo = buildListingSeo(cbmy);
  assert.strictEqual(seo.h1, seo.displayLabel);
  assert.strictEqual(seo.canonicalPath, "/can-truoc-kia-sedona-2014-2020");
  ok("SEO derives from display label");

  const home = normalizeListingIdentity({});
  assert.strictEqual(buildListingPath(home), "/");
  ok("home canonical path");

  console.log("Listing identity engine unit checks passed.");
} catch (err) {
  console.error("Listing unit tests failed:", err?.message ?? err);
  process.exitCode = 2;
}
