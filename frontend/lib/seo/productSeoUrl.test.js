import { describe, expect, it } from "vitest";
import {
  buildProductSeoSlugWithMeta,
  buildProductSeoUrl,
  carFromListingVehicleFilter,
} from "./productSeoUrl.js";

describe("carFromListingVehicleFilter", () => {
  it("returns null when empty", () => {
    expect(carFromListingVehicleFilter(null)).toBeNull();
    expect(carFromListingVehicleFilter({})).toBeNull();
  });

  it("maps listing filter fields", () => {
    expect(
      carFromListingVehicleFilter({
        brand: "Hyundai",
        model: "i10",
        year: "2021",
      }),
    ).toEqual({
      brand: "Hyundai",
      model: "i10",
      yFrom: 2021,
      yTo: 2021,
    });
  });
});

describe("buildProductSeoUrl listingVehicle", () => {
  it("prefers active listing vehicle for slug fitment segments", () => {
    const url = buildProductSeoUrl(
      {
        id: 99,
        shortDescription: "Lọc gió",
        partNumber: "ABC123",
      },
      {
        listingVehicle: { brand: "Hyundai", model: "i10", year: 2021 },
      },
    );
    expect(url).toBe("/loc-gio-hyundai-i10-2021-abc123-99");
  });
});

describe("buildProductSeoSlugWithMeta vehicleSource", () => {
  it("tags marketplaceContext as vehicle source", () => {
    const meta = buildProductSeoSlugWithMeta({
      id: 1,
      shortDescription: "Lọc gió",
      marketplaceContext: { brand: "Hyundai", model: "i10", year: 2021 },
    });
    expect(meta.vehicleSource).toBe("marketplaceContext");
    expect(meta.slug).toContain("hyundai-i10-2021");
  });

  it("tags cars[] fallback when no marketplace context", () => {
    const meta = buildProductSeoSlugWithMeta({
      id: 2,
      shortDescription: "Công tắc",
      cars: [
        { hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2012, year_to: 2016 },
        { hang_xe: "Hyundai", ten_xe: "i10", year_from: 2019, year_to: 2022 },
      ],
    });
    expect(meta.vehicleSource).toBe("cars");
    expect(meta.vehicleFitment?.brand).toBe("Mazda");
    expect(meta.slug).toContain("mazda-cx-9");
  });

  it("tags cars[] before flat card fields when both exist", () => {
    const meta = buildProductSeoSlugWithMeta({
      id: 3,
      shortDescription: "Lọc gió",
      brand: "Hyundai",
      model: "i10",
      yearFrom: 2021,
      cars: [{ hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2012, year_to: 2016 }],
    });
    expect(meta.vehicleSource).toBe("cars");
    expect(meta.slug).toContain("mazda-cx-9");
  });

  it("tags flat card fields when cars[] absent", () => {
    const meta = buildProductSeoSlugWithMeta({
      id: 4,
      shortDescription: "Lọc gió",
      brand: "Hyundai",
      model: "i10",
      yearFrom: 2021,
    });
    expect(meta.vehicleSource).toBe("flat");
    expect(meta.slug).toContain("hyundai-i10-2021");
  });

  it("suppresses cars[] and flat fallbacks when marketplace-safe flag set", () => {
    const meta = buildProductSeoSlugWithMeta({
      id: 5,
      shortDescription: "Công tắc lên kính",
      partNumber: "SW123",
      suppressUnsafeVehicleFallback: true,
      brand: "Hyundai",
      model: "i10",
      yearFrom: 2021,
      cars: [{ hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2012, year_to: 2016 }],
    });
    expect(meta.vehicleSource).toBe("none");
    expect(meta.vehicleFallbackSuppressed).toBe(true);
    expect(meta.slug).toContain("cong-tac-len-kinh");
    expect(meta.slug).toContain("sw123");
    expect(meta.slug).not.toContain("mazda");
    expect(meta.slug).not.toContain("hyundai");
  });
});

describe("buildProductSeoUrl marketplace safe fallback", () => {
  it("uses cars[] when not on marketplace navigation (no window)", () => {
    const url = buildProductSeoUrl({
      id: 7,
      shortDescription: "Công tắc",
      cars: [{ hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2012, year_to: 2016 }],
    });
    expect(url).toContain("mazda-cx-9");
  });
});
