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
    expect(looksLikeProductSlug("some-part-12345")).toBe(true);
  });
});

