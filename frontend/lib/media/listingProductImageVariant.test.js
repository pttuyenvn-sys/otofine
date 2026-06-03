import { describe, expect, it, afterEach } from "vitest";
import {
  inferListingImageSlot,
  isListingMobileViewport,
  LISTING_IMAGE_BREAKPOINT_PX,
  resetListingImageVariantStoreForTests,
  resolveListingImageVariant,
} from "./listingProductImageVariant.js";
import { PRODUCT_IMAGE_VARIANT } from "./productMediaUrl.js";

describe("resolveListingImageVariant", () => {
  it("uses thumb_100 on mobile viewport", () => {
    expect(resolveListingImageVariant("grid", 375)).toBe(
      PRODUCT_IMAGE_VARIANT.THUMB_100,
    );
    expect(resolveListingImageVariant("grid", LISTING_IMAGE_BREAKPOINT_PX)).toBe(
      PRODUCT_IMAGE_VARIANT.THUMB_100,
    );
  });

  it("uses thumb_400 on desktop viewport", () => {
    expect(resolveListingImageVariant("grid", LISTING_IMAGE_BREAKPOINT_PX + 1)).toBe(
      PRODUCT_IMAGE_VARIANT.THUMB_400,
    );
  });

  it("mobile-first SSR default is thumb_100", () => {
    expect(resolveListingImageVariant("grid", null)).toBe(
      PRODUCT_IMAGE_VARIANT.THUMB_100,
    );
    expect(resolveListingImageVariant("grid", undefined)).toBe(
      PRODUCT_IMAGE_VARIANT.THUMB_100,
    );
  });

  it("compact slot always thumb_100", () => {
    expect(resolveListingImageVariant("compact", 1920)).toBe(
      PRODUCT_IMAGE_VARIANT.THUMB_100,
    );
  });

  it("large slot always thumb_400", () => {
    expect(resolveListingImageVariant("large", 375)).toBe(
      PRODUCT_IMAGE_VARIANT.THUMB_400,
    );
  });
});

describe("isListingMobileViewport", () => {
  it("treats null as mobile (SSR mobile-first)", () => {
    expect(isListingMobileViewport(null)).toBe(true);
  });

  it("respects breakpoint", () => {
    expect(isListingMobileViewport(768)).toBe(true);
    expect(isListingMobileViewport(769)).toBe(false);
  });
});

describe("inferListingImageSlot", () => {
  it("fill alone maps to grid (viewport decides variant)", () => {
    expect(inferListingImageSlot({ fill: true })).toBe("grid");
  });

  it("tiny explicit dimensions map to compact", () => {
    expect(inferListingImageSlot({ width: 40, height: 40 })).toBe("compact");
  });

  it("large explicit dimensions map to large", () => {
    expect(inferListingImageSlot({ width: 900, height: 600 })).toBe("large");
  });
});

afterEach(() => {
  resetListingImageVariantStoreForTests();
});
