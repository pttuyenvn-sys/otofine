import { describe, it, expect } from "vitest";
import { looksLikeProductSlug } from "./productSeoUrl.js";

describe("productSeoUrl listing vs product discriminator", () => {
  it("does not treat phu-tung listing slugs as product slugs", () => {
    const examples = [
      "phu-tung-mazda-3-2024",
      "phu-tung-mazda-6-2024",
      "phu-tung-cx-5-2024",
      "phu-tung-i10-2024",
      "phu-tung-q5-2024",
      "phu-tung-x5-2024",
      "phu-tung-320i-2024",
      "phu-tung-c200-2024",
    ];
    for (const s of examples) {
      expect(looksLikeProductSlug(s)).toBe(false);
    }
  });

  it("still recognizes product slugs with trailing id", () => {
    expect(looksLikeProductSlug("loc-xang-toyota-vios-2013-2913")).toBe(true);
    expect(
      looksLikeProductSlug(
        "cong-tac-len-kinh-don-mazda-cx-5-2012-2019-kd3566370-2020",
      ),
    ).toBe(true);
  });

  it("does not treat CBMY year-range listing slugs as product slugs", () => {
    expect(looksLikeProductSlug("can-truoc-kia-sedona-2014-2020")).toBe(false);
  });
});

