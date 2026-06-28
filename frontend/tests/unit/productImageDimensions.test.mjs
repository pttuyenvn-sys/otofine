import assert from "node:assert/strict";
import {
  inferDimensionsFromProductImageUrl,
  productImageDimensionProps,
  resolveProductImageDimensions,
} from "../../lib/image/productImageDimensions.js";

assert.deepEqual(
  inferDimensionsFromProductImageUrl(
    "https://img.otofine.com/shops/1/thumb_400_abc.webp",
  ),
  { width: 400, height: 400 },
);

assert.deepEqual(
  inferDimensionsFromProductImageUrl(
    "https://img.otofine.com/shops/1/thumb_100_abc.webp",
  ),
  { width: 100, height: 100 },
);

assert.deepEqual(
  resolveProductImageDimensions({
    src: "https://img.otofine.com/shops/1/abc.webp",
    layout: "square",
  }),
  { width: 400, height: 400 },
);

assert.deepEqual(
  productImageDimensionProps({ layout: "pdp-main" }),
  { width: 4, height: 3 },
);

console.log("PASS: productImageDimensions unit tests");
