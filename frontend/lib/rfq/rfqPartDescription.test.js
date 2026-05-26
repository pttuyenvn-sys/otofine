import { describe, expect, it } from "vitest";
import { normalizeMergedPartDescription } from "./rfqPartDescription.js";

describe("normalizeMergedPartDescription", () => {
  it("returns single part when merge duplicates same text", () => {
    expect(
      normalizeMergedPartDescription("Cản trước trái\n--- merged ---\nCản trước trái"),
    ).toBe("Cản trước trái");
  });

  it("keeps distinct parts joined", () => {
    expect(
      normalizeMergedPartDescription("Bugi\n--- merged ---\nLọc dầu"),
    ).toBe("Bugi · Lọc dầu");
  });

  it("dedupes case-insensitive repeats", () => {
    expect(
      normalizeMergedPartDescription("Bugi\n--- merged ---\nbuGi"),
    ).toBe("Bugi");
  });

  it("passes through plain text", () => {
    expect(normalizeMergedPartDescription("Cản trước trái")).toBe("Cản trước trái");
  });
});
