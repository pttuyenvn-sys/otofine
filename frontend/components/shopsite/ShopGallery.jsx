/**
 * Storefront image gallery — auto-built from existing seller content.
 *
 * Aggregates 6–12 unique images from:
 *   - shop cover
 *   - intro images (extracted from `introHtml`)
 *   - resolved storefront visuals (homepage promo, about hero)
 *   - product images (in display order)
 *
 * De-duplicates URLs in declaration order so the visual diversity
 * resolver's no-reuse contract is preserved (cover never appears
 * twice, homepage promo never repeats inside the gallery, etc.).
 *
 * Rendering:
 *   - 12-col CSS grid with a hand-tuned `col-span / row-span` pattern
 *     so the gallery feels organic ("masonry-light") without pulling
 *     in a real masonry library.
 *   - Mobile: simpler 2-col grid, swipeable via the underlying
 *     `overflow-x-auto` so the user can flick through tiles.
 *   - Each tile uses `<ShopImage>` so a broken seller URL silently
 *     falls back to a placeholder instead of breaking the layout.
 *
 * SSR-pure server component. No JS hydration cost — the masonry
 * pattern is CSS-only.
 *
 * Skip-render when fewer than 4 unique images are available; a
 * 3-tile gallery looks broken/empty next to the rest of the page.
 */

import ShopImage from "./ShopImage";
import { extractIntroImages } from "@/lib/shopsite/extractIntroImages";

function collectGallerySources(shop, products, visuals) {
  const seen = new Set();
  const out = [];
  function pushUnique(url) {
    if (typeof url !== "string") return;
    const trimmed = url.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  }

  if (shop?.cover) pushUnique(shop.cover);
  if (visuals?.homepagePromo) pushUnique(visuals.homepagePromo);
  if (visuals?.aboutHero) pushUnique(visuals.aboutHero);

  for (const u of extractIntroImages(shop?.introHtml || "")) pushUnique(u);

  if (Array.isArray(products)) {
    for (const p of products) {
      pushUnique(p?.image);
      if (out.length >= 12) break;
    }
  }
  return out.slice(0, 12);
}

// Hand-tuned grid pattern: 12-col grid where tiles vary in width to
// produce a "masonry-light" rhythm. We repeat the pattern modulo 6
// so the gallery scales gracefully from 6 → 12 tiles.
const DESKTOP_PATTERN = [
  "lg:col-span-6 lg:row-span-2",  // 0 — hero
  "lg:col-span-3",                 // 1
  "lg:col-span-3",                 // 2
  "lg:col-span-3",                 // 3
  "lg:col-span-3",                 // 4
  "lg:col-span-4",                 // 5
  "lg:col-span-4",                 // 6
  "lg:col-span-4",                 // 7
  "lg:col-span-3",                 // 8
  "lg:col-span-3",                 // 9
  "lg:col-span-3",                 // 10
  "lg:col-span-3",                 // 11
];

export default function ShopGallery({ shop, products = [], visuals = {}, className = "" }) {
  const images = collectGallerySources(shop, products, visuals);
  if (images.length < 4) return null;

  return (
    <section
      aria-label="Hình ảnh shop"
      className={`bg-white rounded-2xl shadow-sm p-3 sm:p-5 ${className}`}
    >
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[15px] sm:text-base font-bold text-gray-900 leading-tight">
            Hình ảnh từ shop
          </h2>
          <p className="hidden sm:block text-xs text-gray-500 mt-0.5">
            Ảnh sản phẩm thực tế và không gian cửa hàng.
          </p>
        </div>
        <span className="hidden sm:inline-block text-[10px] font-semibold tracking-wide text-gray-400">
          {images.length} ảnh
        </span>
      </div>

      {/* Mobile: 1-row horizontal scroller (swipeable). The whole
          row uses `snap-x` so each tile snaps into view. */}
      <div className="sm:hidden -mx-1 px-1 flex gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar">
        {images.map((src, i) => (
          <div
            key={`m-${i}`}
            className="relative snap-start shrink-0 w-[42%] aspect-square rounded-xl overflow-hidden bg-gray-100"
          >
            <ShopImage
              src={src}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover"
              fallbackClassName="absolute inset-0 w-full h-full"
            />
          </div>
        ))}
      </div>

      {/* Desktop / tablet: CSS masonry-light. The pattern is column-
          driven; row-span only on the first tile so the rest reflow
          naturally below it. */}
      <div className="hidden sm:grid grid-cols-6 lg:grid-cols-12 gap-2 sm:gap-3 grid-flow-row-dense">
        {images.map((src, i) => {
          const pattern = DESKTOP_PATTERN[i] || "lg:col-span-3";
          const aspect = i === 0 ? "aspect-[3/2] lg:aspect-auto" : "aspect-square";
          return (
            <div
              key={`d-${i}`}
              className={`relative ${aspect} rounded-xl overflow-hidden bg-gray-100 col-span-3 sm:col-span-2 ${pattern}`}
            >
              <ShopImage
                src={src}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover"
                fallbackClassName="absolute inset-0 w-full h-full"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
