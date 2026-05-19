import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDedupeFingerprint, normalizeKeywordSnippet } from "../utils/rfqFingerprint.js";

describe("rfqFingerprint", () => {
  it("normalizes keyword snippet", () => {
    assert.equal(normalizeKeywordSnippet("  Đèn   PHA "), "đèn pha");
  });

  it("buildDedupeFingerprint is stable for same inputs", () => {
    const a = buildDedupeFingerprint({
      phoneE164: "+84901234567",
      vehicle: { brand: "Toyota", model: "Camry", year: 2020 },
      partDescription: "Đèn pha trước",
    });
    const b = buildDedupeFingerprint({
      phoneE164: "+84901234567",
      vehicle: { brand: "toyota", model: "camry", year: "2020" },
      partDescription: "đèn pha trước",
    });
    assert.equal(a, b);
  });

  it("different phone yields different fingerprint", () => {
    const base = {
      vehicle: { brand: "Honda", model: "City", year: 2019 },
      partDescription: "Gương chiếu hậu",
    };
    const p1 = buildDedupeFingerprint({ ...base, phoneE164: "+84901111111" });
    const p2 = buildDedupeFingerprint({ ...base, phoneE164: "+84902222222" });
    assert.notEqual(p1, p2);
  });
});
