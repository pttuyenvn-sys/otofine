import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateRfqCreateBody,
  isPlaceholderPartDescription,
  isValidVietnamMobileE164,
  normalizePhoneVN,
} from "../utils/rfqCreateValidation.js";

describe("rfqCreateValidation", () => {
  it("normalizes VN mobile to E.164", () => {
    assert.equal(normalizePhoneVN("0901234567"), "+84901234567");
    assert.equal(isValidVietnamMobileE164("+84901234567"), true);
    assert.equal(isValidVietnamMobileE164("+84123456789"), false);
  });

  it("rejects placeholder descriptions", () => {
    assert.equal(isPlaceholderPartDescription("test"), true);
    assert.equal(isPlaceholderPartDescription("xxxxx"), true);
    assert.equal(isPlaceholderPartDescription("phanh truoc camry bi kem"), false);
  });

  it("rejects invalid create body", () => {
    const r = validateRfqCreateBody({
      phone: "123",
      partDescription: "test",
      vehicle: { brand: "Toyota", model: "Camry", year: 2020 },
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "INVALID_PHONE");

    const r2 = validateRfqCreateBody({
      phone: "0901234567",
      partDescription: "aaaaaaaa",
      vehicle: { brand: "Toyota", model: "Camry", year: 2020 },
    });
    assert.equal(r2.ok, false);
    assert.equal(r2.code, "INVALID_DESCRIPTION");
  });

  it("accepts valid create body", () => {
    const r = validateRfqCreateBody({
      phone: "0901234567",
      partDescription: "Cần thay má phanh trước Camry 2019",
      vehicle: { brand: "Toyota", model: "Camry", year: 2019 },
      imageUrls: ["/uploads/rfq/a.jpg"],
    });
    assert.equal(r.ok, true);
    assert.equal(r.phoneE164, "+84901234567");
    assert.equal(r.vehicle.brand, "Toyota");
    assert.equal(r.imageUrls.length, 1);
  });

  it("rejects too many images", () => {
    const urls = Array.from({ length: 11 }, (_, i) => `/uploads/rfq/${i}.jpg`);
    const r = validateRfqCreateBody({
      phone: "0901234567",
      partDescription: "Cần lọc dầu và bugi cho Vios",
      vehicle: { brand: "Toyota", model: "Vios", year: 2018 },
      imageUrls: urls,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "TOO_MANY_IMAGES");
  });
});
