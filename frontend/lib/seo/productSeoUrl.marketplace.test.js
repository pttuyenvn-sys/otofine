import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildProductSeoUrl } from "./productSeoUrl.js";

describe("buildProductSeoUrl marketplace safe fallback (client)", () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("suppresses wrong fitment slug on marketplace home without recoverable context", () => {
    const url = buildProductSeoUrl({
      id: 42,
      shortDescription: "Công tắc lên kính",
      partNumber: "SW123",
      cars: [
        { hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2012, year_to: 2016 },
      ],
    });

    expect(url).toBe("/cong-tac-len-kinh-sw123-42");
    expect(url).not.toContain("mazda");
  });

  it("recovers query context before suppressing on listing navigation", () => {
    window.location.search = "?vb=hyundai&vm=i10&vy=2021";

    const url = buildProductSeoUrl({
      id: 42,
      shortDescription: "Công tắc lên kính",
      partNumber: "SW123",
      cars: [
        { hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2012, year_to: 2016 },
      ],
    });

    expect(url).toContain("hyundai-i10-2021");
    expect(url).not.toContain("mazda");
  });
});
