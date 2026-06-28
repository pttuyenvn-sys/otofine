import assert from "node:assert/strict";
import {
  buildProductImageAlt,
  normalizeFitmentForAlt,
  PRODUCT_IMAGE_ALT_MAX_LENGTH,
  resolvePrimaryFitmentForAlt,
} from "../../lib/seo/buildProductImageAlt.js";

assert.equal(
  buildProductImageAlt({
    partName: "Má phanh trước",
    brand: "Toyota",
    model: "Vios",
    yearFrom: 2014,
    yearTo: 2020,
    partNumber: "04465-0D140",
  }),
  "Má phanh trước Toyota Vios 2014-2020 - Mã 04465-0D140",
);

assert.equal(
  buildProductImageAlt({
    partName: "Lọc dầu",
    cars: [
      {
        hang_xe: "Honda",
        ten_xe: "City",
        year_from: 2014,
        year_to: 2020,
        is_primary: 1,
      },
    ],
    partNumber: "15400-RTA-003",
  }),
  "Lọc dầu Honda City 2014-2020 - Mã 15400-RTA-003",
);

assert.equal(
  buildProductImageAlt({
    partName: "Má phanh trước",
    brand: "Toyota",
    model: "Vios",
    yearFrom: 2014,
    yearTo: 2020,
  }),
  "Má phanh trước Toyota Vios 2014-2020",
);

assert.equal(
  buildProductImageAlt({
    partName: "Má phanh trước",
    partNumber: "04465-0D140",
  }),
  "Má phanh trước - Mã 04465-0D140",
);

assert.equal(
  buildProductImageAlt({
    partName: "Đèn pha phải",
  }),
  "Đèn pha phải",
);

assert.equal(buildProductImageAlt({}), "Phụ tùng ô tô");

const longName = "A".repeat(200);
const longAlt = buildProductImageAlt({
  partName: longName,
  brand: "Toyota",
  model: "Vios",
  yearFrom: 2014,
  yearTo: 2020,
  partNumber: "04465-0D140",
});
assert.ok(longAlt.length <= PRODUCT_IMAGE_ALT_MAX_LENGTH);
assert.ok(longAlt.includes(" - Mã 04465-0D140"));

const fitment = resolvePrimaryFitmentForAlt({
  productIdentity: {
    fitment: {
      brand: "Kia",
      model: "Morning",
      year_from: 2011,
      year_to: 2017,
    },
  },
});
assert.equal(normalizeFitmentForAlt(fitment).yearRange, "2011-2017");

console.log("PASS: buildProductImageAlt unit tests");
