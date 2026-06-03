import { describe, expect, it } from "vitest";
import {
  planSeoArticleEnhancements,
  pickProductOriginalImage,
} from "../../components/seo/seoArticleBodyEnhance.js";
import { getProductImageFallbackChain, PRODUCT_IMAGE_VARIANT } from "./productMediaUrl.js";

const SAMPLE =
  "https://img.otofine.com/shops/2/517202k000koy.webp";

describe("SEO article strict thumbnails", () => {
  it("pickProductOriginalImage returns catalog original", () => {
    const url = pickProductOriginalImage(
      { id: 1, image: SAMPLE },
      {},
      (u) => String(u),
    );
    expect(url).toBe(SAMPLE);
  });

  it("plan segments include topProducts without HTML img tags", () => {
    const html = "<h2>One</h2><p>Body</p><h2>Two</h2><h2>Three</h2><h2>Four</h2>";
    const { segments } = planSeoArticleEnhancements(html, {
      imageProducts: [{ id: 1, image: SAMPLE, partName: "Test", price: 1000 }],
      productThumbnails: {},
      resolveImg: (u) => String(u),
      partDisplayName: "Phanh",
    });

    const top = segments.find((s) => s.kind === "topProducts");
    expect(top).toBeTruthy();
    expect(top.products[0].imageSrc).toBe(SAMPLE);

    const joined = JSON.stringify(segments);
    expect(joined).not.toContain("<img");
    expect(joined).not.toContain("thumb_100_");
  });

  it("strict chain for rail imageSrc includes original fallback", () => {
    const chain = getProductImageFallbackChain(SAMPLE, PRODUCT_IMAGE_VARIANT.THUMB_400, {
      allowOriginalFallback: false,
    });
    expect(chain[0]).toContain("thumb_400_");
    expect(chain[1]).toBe(SAMPLE);
  });
});
