import { describe, expect, it } from "vitest";
import { buildSameRowVehicleFitmentExistsSql } from "./listingVehicleFitmentSql.js";

describe("buildSameRowVehicleFitmentExistsSql", () => {
  it("returns null when no vehicle filters", () => {
    expect(buildSameRowVehicleFitmentExistsSql("p.id", {})).toBeNull();
  });

  it("combines brand, model, and year in one EXISTS", () => {
    const built = buildSameRowVehicleFitmentExistsSql("p.id", {
      brand: "Hyundai",
      model: "i10",
      year: 2021,
    });
    expect(built).not.toBeNull();
    expect(built.sql).toContain("product_car_applications pa");
    expect(built.sql).toContain("cm.hang_xe");
    expect(built.sql).toContain("cm.ten_xe");
    expect(built.sql).toContain("year_from");
    expect(built.sql).toContain("year_to");
    expect(built.sql.match(/EXISTS/g)).toHaveLength(1);
    expect(built.params).toEqual(["hyundai", "i10", 2021, 2021]);
  });
});
