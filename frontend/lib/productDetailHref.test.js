import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MARKETPLACE_LISTING_SESSION_KEY } from "@/lib/listing/marketplaceListingSession";

vi.mock("@/lib/seo/productSeoUrl", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isMarketplaceListingNavigation: vi.fn(() => true),
    devWarnMissingMarketplaceContext: vi.fn(),
  };
});

import { getProductDetailHref } from "./productDetailHref.js";
import { isMarketplaceListingNavigation } from "@/lib/seo/productSeoUrl";

describe("getProductDetailHref marketplace recovery", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/",
        search: "",
      },
    });
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    isMarketplaceListingNavigation.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recovers listing vehicle from session instead of cars[] fitment", () => {
    sessionStorage.getItem.mockReturnValue(
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        filters: { brand: "Hyundai", model: "i10", year: "2021" },
      }),
    );

    const href = getProductDetailHref({
      id: 42,
      shortDescription: "Công tắc lên kính",
      partNumber: "SW123",
      cars: [
        { hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2012, year_to: 2016 },
        { hang_xe: "Hyundai", ten_xe: "i10", year_from: 2019, year_to: 2022 },
      ],
    });

    expect(href).toContain("hyundai-i10-2021");
    expect(href).not.toContain("mazda-cx-9");
    expect(href).not.toMatch(/[?&]vb=/);
    expect(href).not.toMatch(/[?&]vm=/);
    expect(href).not.toMatch(/[?&]vy=/);
    expect(href).not.toMatch(/[?&]cat=/);
    expect(sessionStorage.getItem).toHaveBeenCalledWith(
      MARKETPLACE_LISTING_SESSION_KEY,
    );
  });

  it("recovers listing vehicle from query params when session empty", () => {
    window.location.search = "?vb=hyundai&vm=i10&vy=2021";

    const href = getProductDetailHref({
      id: 42,
      shortDescription: "Công tắc lên kính",
      partNumber: "SW123",
      cars: [
        { hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2012, year_to: 2016 },
      ],
    });

    expect(href).toContain("hyundai-i10-2021");
    expect(href).not.toContain("mazda-cx-9");
    expect(href).not.toMatch(/[?&]vb=/);
  });

  it("does not append marketplace query params when context is explicit", () => {
    const href = getProductDetailHref(
      {
        id: 42,
        shortDescription: "Cản trước",
        partNumber: "BUMPER1",
        cars: [{ hang_xe: "Mazda", ten_xe: "6", year_from: 2015, year_to: 2019 }],
      },
      {
        marketplaceContext: {
          brand: "Mazda",
          model: "6",
          year: 2019,
          category: "Cản trước",
        },
      },
    );

    expect(href).toContain("mazda-6-2019");
    expect(href).not.toMatch(/[?&](vb|vm|vy|cat)=/);
  });

  it("skips recovery outside marketplace navigation", () => {
    window.location.pathname = "/shop/products";
    isMarketplaceListingNavigation.mockReturnValue(false);

    const href = getProductDetailHref({
      id: 42,
      shortDescription: "Công tắc lên kính",
      cars: [{ hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2012, year_to: 2016 }],
    });

    expect(href).toContain("mazda-cx-9");
  });
});
