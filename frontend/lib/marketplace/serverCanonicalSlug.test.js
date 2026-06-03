import { describe, expect, it } from "vitest";
import {
  buildServerCanonicalProductPath,
  buildServerCanonicalProductSlug,
  hasMarketplaceNavigationQuery,
} from "./serverCanonicalSlug.js";

const product = {
  id: 42,
  shortDescription: "Công tắc lên kính",
  partNumber: "SW123",
};

const cars = [
  { hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2012, year_to: 2016 },
  { hang_xe: "Hyundai", ten_xe: "i10", year_from: 2019, year_to: 2022 },
];

describe("serverCanonicalSlug", () => {
  it("uses cars[] fitment for organic visits without marketplace query", () => {
    const slug = buildServerCanonicalProductSlug(product, cars, null);
    expect(slug).toContain("mazda-cx-9");
  });

  it("prefers marketplace query context over cars[]", () => {
    const slug = buildServerCanonicalProductSlug(product, cars, {
      vb: "hyundai",
      vm: "i10",
      vy: "2021",
    });
    expect(slug).toContain("hyundai-i10-2021");
    expect(slug).not.toContain("mazda");
  });

  it("suppresses wrong vehicle when marketplace origin lacks vehicle context", () => {
    const slug = buildServerCanonicalProductSlug(product, cars, {
      __src: "homecard",
    });
    expect(hasMarketplaceNavigationQuery({ __src: "homecard" })).toBe(true);
    expect(slug).not.toContain("mazda");
    expect(slug).toContain("cong-tac-len-kinh");
  });

  it("builds redirect path with preserved marketplace query", () => {
    const path = buildServerCanonicalProductPath(product, cars, {
      vb: "hyundai",
      vm: "i10",
      vy: "2021",
    });
    expect(path).toContain("hyundai-i10-2021");
    expect(path).toContain("vb=hyundai");
    expect(path).not.toContain("mazda");
  });
});
