const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

(async () => {
  const modPath = path.resolve(__dirname, "../../lib/seo/productSeoUrl.js");
  const mod = await import(pathToFileURL(modPath).href);

  const looksLike = mod.looksLikeProductSlug;
  const extract = mod.extractProductIdFromSeoSlug;

  const tests = [
    { slug: "some-part-2913", looksLike: true, id: 2913 },
    { slug: "2913", looksLike: true, id: 2913 },
    { slug: "phu-tung-mazda-6-2024", looksLike: false, id: null },
    { slug: "toyota-vios-2025", looksLike: false, id: null }, // year-like trailing
    { slug: "part-2021-12345", looksLike: true, id: 12345 },
  ];

  let failed = 0;
  for (const t of tests) {
    try {
      const l = looksLike(t.slug);
      assert.strictEqual(l, t.looksLike);
      const id = extract(t.slug);
      assert.strictEqual(id, t.id);
      console.log("PASS productSlug", t.slug, "looksLike", l, "id", id);
    } catch (err) {
      console.error("FAIL productSlug", t.slug, err && err.message);
      failed += 1;
    }
  }
  process.exit(failed ? 2 : 0);
})();

