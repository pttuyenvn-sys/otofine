import { describe, expect, it } from "vitest";
import {
  LISTING_VIRTUAL_MIN_ITEMS,
  LISTING_VIRTUAL_OVERSCAN,
} from "./listingVirtualization.js";

describe("listingVirtualization constants", () => {
  it("activates only on long pages", () => {
    expect(LISTING_VIRTUAL_MIN_ITEMS).toBe(24);
  });

  it("keeps overscan in 4–8 window", () => {
    expect(LISTING_VIRTUAL_OVERSCAN).toBeGreaterThanOrEqual(4);
    expect(LISTING_VIRTUAL_OVERSCAN).toBeLessThanOrEqual(8);
  });
});
