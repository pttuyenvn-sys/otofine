import { describe, expect, it } from "vitest";
import {
  normalizeSellerDraftSnapshot,
  normalizeSellerProductImageUrl,
  normalizeSellerProductImages,
  sanitizeSellerProductHtml,
} from "./sellerProductMedia.js";

const LEGACY =
  "https://otofine.com/images/thumbs/0052226_96210A9000SWP.png";

describe("sellerProductMedia", () => {
  it("rewrites legacy gallery urls for seller previews", () => {
    expect(
      normalizeSellerProductImageUrl(LEGACY, {
        shopId: 2,
        partNumber: "96210A9000SWP",
      }),
    ).toBe("https://img.otofine.com/shops/2/96210A9000SWP.webp");
  });

  it("sanitizes rich text without dropping draft fields", () => {
    const html = `<p><img src="${LEGACY}" /></p>`;
    const out = sanitizeSellerProductHtml(html, {
      shopId: 2,
      partNumber: "96210A9000SWP",
    });
    expect(out).toContain("https://img.otofine.com/shops/2/96210A9000SWP.webp");
    expect(out).not.toContain("/images/thumbs/");
  });

  it("normalizes draft snapshots in place", () => {
    const draft = {
      partNumber: "96210A9000SWP",
      description: `<img src="${LEGACY}" />`,
      existingImages: [{ id: 1, url: LEGACY }],
      carRows: [{ brand: "Kia" }],
    };
    const normalized = normalizeSellerDraftSnapshot(draft, { shopId: 2 });
    expect(normalized.carRows).toEqual(draft.carRows);
    expect(normalized.existingImages[0].url).toContain("img.otofine.com");
    expect(normalized.description).not.toContain("/images/thumbs/");
  });

  it("clears unrecoverable legacy image rows", () => {
    const rows = normalizeSellerProductImages([{ id: 9, url: LEGACY }], {});
    expect(rows[0].url).toBe("");
  });
});
