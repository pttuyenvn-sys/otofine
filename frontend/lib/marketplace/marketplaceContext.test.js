import { describe, expect, it } from "vitest";
import {
  appendMarketplaceContextQuery,
  isEmptyMarketplaceContext,
  marketplaceContextFromFilters,
  parseMarketplaceContextFromPathname,
  parseMarketplaceContextFromLocation,
  parseMarketplaceContextFromQuery,
  pickExactFitmentContextFromCars,
  resolveActiveMarketplaceContext,
  resolveMarketplaceContextForHref,
  serializeMarketplaceContextQuery,
} from "./marketplaceContext.js";

describe("marketplaceContext", () => {
  it("serializes and parses lightweight query params", () => {
    const ctx = marketplaceContextFromFilters({
      brand: "Hyundai",
      model: "i10",
      year: "2021",
      category: "Lọc gió",
      location: "Hà Nội",
    });
    const qs = serializeMarketplaceContextQuery(ctx).toString();
    expect(qs).toContain("vb=hyundai");
    expect(qs).toContain("vm=i10");
    expect(qs).toContain("vy=2021");

    const parsed = parseMarketplaceContextFromQuery(qs);
    expect(parsed.brand).toBe("Hyundai");
    expect(parsed.model).toBe("i10");
    expect(parsed.year).toBe(2021);
  });

  it("prefers query context over session for active vehicle", () => {
    const active = resolveActiveMarketplaceContext({
      queryContext: { brand: "Hyundai", model: "i10", year: 2021 },
      sessionContext: { brand: "Mazda", model: "CX-9", year: 2020 },
      cars: [
        { hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2018, year_to: 2022 },
        { hang_xe: "Hyundai", ten_xe: "i10", year_from: 2019, year_to: 2022 },
      ],
    });
    expect(active.brand).toBe("Hyundai");
    expect(active.model).toBe("i10");
    expect(active.year).toBe(2021);
  });

  it("uses exact fitment fallback when only partial hints exist", () => {
    const exact = pickExactFitmentContextFromCars(
      [
        { hang_xe: "Hyundai", ten_xe: "i10", year_from: 2019, year_to: 2022 },
        { hang_xe: "Mazda", ten_xe: "CX-9", year_from: 2018, year_to: 2022 },
      ],
      { brand: "Hyundai", model: "i10", year: 2021 },
    );
    expect(exact).toEqual({
      brand: "Hyundai",
      model: "i10",
      year: 2021,
    });
  });

  it("appends context query to product href", () => {
    const href = appendMarketplaceContextQuery("/part-1", {
      brand: "Hyundai",
      model: "i10",
      year: 2021,
    });
    expect(href).toContain("vb=hyundai");
    expect(href.startsWith("/part-1?")).toBe(true);
  });

  it("parseMarketplaceContextFromPathname is disabled", () => {
    expect(parseMarketplaceContextFromPathname("/phu-tung-hyundai-i10-2021")).toBeNull();
    expect(parseMarketplaceContextFromPathname("/phu-tung-mazda-i10-2021")).toBeNull();
  });

  it("parseMarketplaceContextFromLocation ignores pathname", () => {
    const ctx = parseMarketplaceContextFromLocation({
      pathname: "/phu-tung-hyundai-i10-2021",
      search: "",
    });
    expect(isEmptyMarketplaceContext(ctx)).toBe(true);
  });

  it("parseMarketplaceContextFromLocation uses query params only", () => {
    const ctx = parseMarketplaceContextFromLocation({
      pathname: "/cong-tac-len-kinh-tong-mazda-cx-9-2012-abc123-99",
      search: "?vb=hyundai&vm=i10&vy=2021",
    });
    expect(ctx.brand).toBe("Hyundai");
    expect(ctx.model).toBe("i10");
    expect(ctx.year).toBe(2021);
  });

  it("resolveMarketplaceContextForHref prefers explicit options", () => {
    const ctx = resolveMarketplaceContextForHref(
      {
        marketplaceContext: { brand: "Toyota", model: "Vios", year: 2020 },
      },
      { allowRecovery: true },
    );
    expect(ctx.brand).toBe("Toyota");
    expect(ctx.model).toBe("Vios");
  });

  it("resolveMarketplaceContextForHref uses query when recovery allowed", () => {
    const ctx = resolveMarketplaceContextForHref(
      {},
      {
        allowRecovery: true,
        loc: { search: "?vb=hyundai&vm=i10&vy=2021" },
      },
    );
    expect(ctx.brand).toBe("Hyundai");
    expect(ctx.model).toBe("i10");
    expect(ctx.year).toBe(2021);
  });
});
