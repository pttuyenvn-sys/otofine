import { describe, expect, it } from "vitest";
import {
  deriveRfqThumbnailCandidates,
  getRfqMediaFallbackChain,
  RFQ_IMAGE_PLACEHOLDER,
  RFQ_MEDIA_VARIANT,
  resolveRfqDisplayUrl,
  rfqImageSrc,
} from "./rfqMediaUrl.js";

const ORIGINAL =
  "https://rfq-img.example.com/rfq/chat/2026/05/abc123.jpg";

describe("rfqMediaUrl fallback chain", () => {
  it("derives sidecar candidates from original URL", () => {
    const c = deriveRfqThumbnailCandidates(ORIGINAL);
    expect(c.small.webp).toBe(
      "https://rfq-img.example.com/rfq/chat/2026/05/thumb_100_abc123.webp",
    );
    expect(c.medium.webp).toBe(
      "https://rfq-img.example.com/rfq/chat/2026/05/thumb_400_abc123.webp",
    );
  });

  it("small variant chain crosses to medium before original", () => {
    const chain = getRfqMediaFallbackChain(ORIGINAL, RFQ_MEDIA_VARIANT.SMALL);
    expect(chain[0]).toContain("thumb_100_");
    expect(chain.some((u) => u.includes("thumb_400_"))).toBe(true);
    expect(chain).toContain(rfqImageSrc(ORIGINAL));
    expect(chain[chain.length - 1]).toBe(RFQ_IMAGE_PLACEHOLDER);
  });

  it("medium variant chain crosses to small before original", () => {
    const chain = getRfqMediaFallbackChain(ORIGINAL, RFQ_MEDIA_VARIANT.MEDIUM);
    expect(chain[0]).toContain("thumb_400_");
    expect(chain.some((u) => u.includes("thumb_100_"))).toBe(true);
    expect(chain).toContain(rfqImageSrc(ORIGINAL));
    expect(chain[chain.length - 1]).toBe(RFQ_IMAGE_PLACEHOLDER);
  });

  it("original variant skips thumbs", () => {
    const chain = getRfqMediaFallbackChain(ORIGINAL, RFQ_MEDIA_VARIANT.ORIGINAL);
    expect(chain).toEqual([rfqImageSrc(ORIGINAL), RFQ_IMAGE_PLACEHOLDER]);
  });

  it("dedupes identical resolved URLs", () => {
    const chain = getRfqMediaFallbackChain(ORIGINAL, RFQ_MEDIA_VARIANT.SMALL);
    const unique = new Set(chain);
    expect(unique.size).toBe(chain.length);
  });

  it("resolveRfqDisplayUrl returns first chain step", () => {
    expect(resolveRfqDisplayUrl(ORIGINAL, RFQ_MEDIA_VARIANT.SMALL)).toBe(
      getRfqMediaFallbackChain(ORIGINAL, RFQ_MEDIA_VARIANT.SMALL)[0],
    );
  });
});
