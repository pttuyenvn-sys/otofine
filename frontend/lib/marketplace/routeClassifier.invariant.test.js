import { describe, expect, it } from "vitest";
import { isMarketplaceListingSlug } from "./isMarketplaceListingSlug.js";
import { looksLikeProductSlug } from "../seo/productSeoUrl.js";

/** Listing slugs — must NEVER enter product canonical flow. */
const LISTING_SLUGS = [
  "phu-tung-hyundai-i10-2021",
  "dong-co-hyundai-i10-2021",
  "hyundai-i10-2021",
  "mazda-3-2024",
  "mazda-cx-5-2022",
  "loc-gio-hyundai-i10-2021",
  "loc-gio-o-to",
  "phu-tung-mazda-3-2024",
  "phu-tung-dong-co-hyundai-i10-2021",
];

/** Product slugs — must ALWAYS be product candidates. */
const PRODUCT_SLUGS = [
  "curoa-bom-nuoc-p30115908-2085",
  "cong-tac-len-kinh-tong-mazda-3-2013-bjg366350aoem-2024",
  "op-cua-truoc-phai-hyundai-santafe-2019-87722s1300tri-7483",
];

describe("route classifier invariants", () => {
  describe("listing slugs (never product)", () => {
    it.each(LISTING_SLUGS)("isMarketplaceListingSlug(%s) === true", (slug) => {
      expect(isMarketplaceListingSlug(slug)).toBe(true);
    });

    it.each(LISTING_SLUGS)("looksLikeProductSlug(%s) === false", (slug) => {
      expect(looksLikeProductSlug(slug)).toBe(false);
    });

    it.each(LISTING_SLUGS)("no overlap: listing and product both true for %s", (slug) => {
      const listing = isMarketplaceListingSlug(slug);
      const product = looksLikeProductSlug(slug);
      expect(listing && product).toBe(false);
    });
  });

  describe("product slugs (always product)", () => {
    it.each(PRODUCT_SLUGS)("isMarketplaceListingSlug(%s) === false", (slug) => {
      expect(isMarketplaceListingSlug(slug)).toBe(false);
    });

    it.each(PRODUCT_SLUGS)("looksLikeProductSlug(%s) === true", (slug) => {
      expect(looksLikeProductSlug(slug)).toBe(true);
    });
  });
});
