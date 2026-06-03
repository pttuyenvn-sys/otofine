import { describe, expect, it } from "vitest";
import {
  deriveProductThumbnailCandidates,
  extractPartNumberFromLegacyThumbUrl,
  getProductImageFallbackChain,
  getProductImageUrl,
  isLegacyLocalThumbUrl,
  PRODUCT_IMAGE_VARIANT,
  PRODUCT_IMAGE_PLACEHOLDER,
  resolveLegacyThumbToOriginal,
  rewriteLegacyThumbUrlsInHtml,
} from "./productMediaUrl.js";

const SAMPLE =
  "https://img.otofine.com/shops/2/517202k000koy.webp";

const LEGACY_THUMB =
  "https://otofine.com/images/thumbs/0052226_96210A9000SWP.png";

describe("legacy local thumb URLs", () => {
  it("detects legacy thumb paths", () => {
    expect(isLegacyLocalThumbUrl(LEGACY_THUMB)).toBe(true);
    expect(isLegacyLocalThumbUrl("/images/thumbs/0052226_96210A9000SWP.png")).toBe(
      true,
    );
    expect(isLegacyLocalThumbUrl(SAMPLE)).toBe(false);
  });

  it("extracts part number from legacy filename", () => {
    expect(extractPartNumberFromLegacyThumbUrl(LEGACY_THUMB)).toBe("96210A9000SWP");
  });

  it("rewrites legacy thumb to R2 original", () => {
    expect(
      resolveLegacyThumbToOriginal(LEGACY_THUMB, {
        shopId: 2,
        partNumber: "96210A9000SWP",
      }),
    ).toBe("https://img.otofine.com/shops/2/96210A9000SWP.webp");
  });

  it("rewrites legacy img tags inside product description HTML", () => {
    const html = `<p><img src="${LEGACY_THUMB}" alt="" /></p>`;
    const out = rewriteLegacyThumbUrlsInHtml(html, {
      shopId: 2,
      partNumber: "96210A9000SWP",
    });
    expect(out).toContain("https://img.otofine.com/shops/2/96210A9000SWP.webp");
    expect(out).not.toContain("/images/thumbs/");
  });
});

describe("deriveProductThumbnailCandidates", () => {
  it("derives sidecar webp keys", () => {
    const c = deriveProductThumbnailCandidates(SAMPLE);
    expect(c.thumb_100).toBe(
      "https://img.otofine.com/shops/2/thumb_100_517202k000koy.webp",
    );
    expect(c.thumb_400).toBe(
      "https://img.otofine.com/shops/2/thumb_400_517202k000koy.webp",
    );
  });
});

describe("getProductImageFallbackChain", () => {
  it("listing mode: thumb then placeholder only", () => {
    const chain = getProductImageFallbackChain(
      SAMPLE,
      PRODUCT_IMAGE_VARIANT.THUMB_100,
      { allowOriginalFallback: false },
    );
    expect(chain).toEqual([
      "https://img.otofine.com/shops/2/thumb_100_517202k000koy.webp",
      PRODUCT_IMAGE_PLACEHOLDER,
    ]);
  });

  it("detail mode: thumb then original then placeholder", () => {
    const chain = getProductImageFallbackChain(
      SAMPLE,
      PRODUCT_IMAGE_VARIANT.THUMB_400,
      { allowOriginalFallback: true },
    );
    expect(chain[0]).toContain("thumb_400_");
    expect(chain[1]).toBe(SAMPLE);
    expect(chain[2]).toBe(PRODUCT_IMAGE_PLACEHOLDER);
  });

  it("original variant keeps original in chain", () => {
    const chain = getProductImageFallbackChain(
      SAMPLE,
      PRODUCT_IMAGE_VARIANT.ORIGINAL,
      { allowOriginalFallback: false },
    );
    expect(chain[0]).toBe(SAMPLE);
  });

  it("never emits legacy local thumb URLs", () => {
    const chain = getProductImageFallbackChain(
      LEGACY_THUMB,
      PRODUCT_IMAGE_VARIANT.THUMB_400,
      { shopId: 2, partNumber: "96210A9000SWP", allowOriginalFallback: true },
    );
    expect(chain.join("|")).not.toContain("/images/thumbs/");
    expect(chain[0]).toContain("thumb_400_");
    expect(chain[1]).toBe("https://img.otofine.com/shops/2/96210A9000SWP.webp");
  });
});

describe("getProductImageUrl", () => {
  it("returns derived thumb without falling back to original", () => {
    expect(getProductImageUrl(SAMPLE, PRODUCT_IMAGE_VARIANT.THUMB_100)).toContain(
      "thumb_100_",
    );
    expect(getProductImageUrl(SAMPLE, PRODUCT_IMAGE_VARIANT.THUMB_100)).not.toBe(
      SAMPLE,
    );
  });
});
