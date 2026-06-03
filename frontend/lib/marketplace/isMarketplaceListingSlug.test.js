import { describe, expect, it } from "vitest";
import { isMarketplaceListingSlug } from "./isMarketplaceListingSlug.js";

describe("isMarketplaceListingSlug", () => {
  it.each([
    "phu-tung-hyundai-i10-2021",
    "loc-gio-o-to",
    "dong-co-hyundai-i10-2021",
    "hyundai-i10-2021",
    "mazda-3-2024",
    "loc-gio-hyundai-i10-2021",
    "phu-tung-mazda-3-2024",
    "phu-tung-dong-co-hyundai-i10-2021",
  ])("returns true for listing slug %s", (slug) => {
    expect(isMarketplaceListingSlug(slug)).toBe(true);
  });

  it.each([
    "curoa-bom-nuoc-p30115908-2085",
    "cong-tac-len-kinh-tong-mazda-3-2013-bjg366350aoem-2024",
    "op-cua-truoc-phai-hyundai-santafe-2019-87722s1300tri-7483",
  ])("returns false for product slug %s", (slug) => {
    expect(isMarketplaceListingSlug(slug)).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isMarketplaceListingSlug("")).toBe(false);
    expect(isMarketplaceListingSlug(null)).toBe(false);
  });
});
