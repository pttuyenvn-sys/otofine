import assert from "node:assert/strict";
import { renderSitemapUrlset } from "../../lib/seo/sitemap/xml.server.js";

const xml = renderSitemapUrlset([
  {
    url: "https://otofine.com/test-product-1",
    lastModified: new Date("2026-01-01"),
    images: [
      {
        loc: "https://img.otofine.com/shops/1/abc.webp",
        title: "Má phanh trước Toyota Vios 2014-2020 - Mã 04465-0D140",
      },
    ],
  },
]);

assert.ok(xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'));
assert.ok(xml.includes("<image:image>"));
assert.ok(xml.includes("<image:loc>https://img.otofine.com/shops/1/abc.webp</image:loc>"));
assert.ok(xml.includes("<image:title>Má phanh trước Toyota Vios"));

const plain = renderSitemapUrlset([
  { url: "https://otofine.com/listing-only", lastModified: new Date("2026-01-01") },
]);
assert.ok(!plain.includes("xmlns:image"));
assert.ok(!plain.includes("<image:image>"));

console.log("PASS: sitemap image xml unit tests");
