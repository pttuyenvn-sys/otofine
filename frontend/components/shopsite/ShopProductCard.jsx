"use client";

import { formatPrice } from "@/data/shop-demo";
import { apexProductUrl } from "@/lib/apexOrigin";
import { deriveProductTrustBadge } from "@/lib/shopsite/productTrust";
import { ShopsiteEvents, trackShopsiteEvent } from "@/lib/shopsite/shopsiteAnalytics";
import ShopImage from "./ShopImage";

/**
 * Vertical product card (Shopee-like).
 *
 * Click target: apex `/<slug>-<id>` (root-level canonical SEO URL).
 * Phase 4 forces ABSOLUTE apex URLs so that a click from a shop
 * subdomain (`cuahangoto355.otofine.com`) always crosses back to apex
 * (`otofine.com/<slug>-<id>`) — no host-aware rewrite, no duplicate
 * canonical surface. After the SEO URL migration the legacy
 * `/product/<id>` AND `/phu-tung/<slug>-<id>` forms 308-redirect to
 * this canonical, so any older cards / link archives keep working
 * with a single hop. See audit/shop-public-seo-strategy.md.
 *
 * Typography hierarchy (top → bottom):
 *   1. Product image (1:1, lazy)
 *   2. Product name — 14px, gray-900, 2-line clamp
 *   3. Vehicle fitment line — 12px, gray-500, single-line ellipsis
 *      Format: "Toyota • Vios • 2018-2021"
 *      Skips any missing field so we never render dangling bullets.
 *   4. Price — 16px, brand red, bold
 *   5. "Loại hàng" chip — 11px, gray, self-start so it doesn't stretch.
 *      Source priority: product.partType (from part_knowledge.name_vi)
 *      → product.category (legacy fallback) → nothing.
 *
 * The fitment line uses `line-clamp-1` + `truncate` so it never
 * pushes the price below the fold on narrow mobile widths.
 */
export default function ShopProductCard({ product, shopSlug }) {
  if (!product) return null;
  // Pass the full product shape (name + brand + model + year + part
  // number) so the apex URL the visitor crosses to is already the
  // root canonical `/<slug>-<id>` — no redirect hop on click. Falls
  // back to short `/p/<id>` form when the card has minimal data,
  // and the dedicated redirect route handles canonical repair in
  // a single 308 hop.
  const href = product.productId
    ? apexProductUrl({ id: product.productId, ...product })
    : "#";
  const fitmentLine = formatVehicleLine(product);
  // "Loại hàng" — prefer the canonical part-knowledge label (e.g.
  // "Phớt trục số") over the legacy `category` field, which in seed
  // data is often a Title-Case clone of the product name. Falls back
  // to `category`, and finally renders nothing if both are absent so
  // the chip degrades gracefully.
  const partTypeLabel = (product.partType || product.category || "").trim();
  // Phase 5.1 — optional trust pill (Chính hãng / OEM / Aftermarket)
  // derived from the seller-provided `origin` string. null → not shown.
  const trustBadge = deriveProductTrustBadge(product);

  const handleClick = () => {
    trackShopsiteEvent(ShopsiteEvents.PRODUCT_CLICK, {
      shopSlug,
      productId: product.productId || product.id || null,
    });
  };

  return (
    <a
      href={href}
      rel="noopener"
      onClick={handleClick}
      className="group flex flex-col rounded-2xl border border-gray-100 bg-white overflow-hidden hover:border-[#e60012] hover:shadow-md transition-all"
    >
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <ShopImage
          src={product.image || ""}
          alt={product.name || "Sản phẩm"}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          fallbackClassName="h-full w-full"
        />
        {trustBadge && (
          <span
            className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ring-1 backdrop-blur-sm ${TRUST_TONES[trustBadge.tone] || TRUST_TONES.gray}`}
            title={trustBadge.label}
          >
            {trustBadge.label}
          </span>
        )}
        <button
          type="button"
          aria-label={`Lưu sản phẩm ${product.name || ""}`.trim()}
          className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/90 text-gray-500 hover:text-[#e60012] shadow-sm"
          onClick={(e) => e.preventDefault()}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      <div className="p-3 flex-1 flex flex-col">
        <h3 className="text-sm text-gray-900 leading-snug line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </h3>

        {fitmentLine ? (
          <p
            className="mt-1 text-[12px] text-gray-500 truncate"
            title={fitmentLine}
          >
            {fitmentLine}
          </p>
        ) : (
          // Reserve a constant 1-line gap when the fitment is unknown so
          // the price stays vertically aligned across the grid.
          <p className="mt-1 text-[12px] text-transparent select-none" aria-hidden>
            &nbsp;
          </p>
        )}

        <div className="mt-1 text-[#e60012] font-bold text-base tabular-nums">
          {formatPrice(product.price)}
        </div>
        {partTypeLabel && (
          <div
            className="mt-1.5 inline-block self-start text-[11px] text-gray-600 bg-gray-100 rounded px-2 py-0.5 max-w-full truncate"
            title={partTypeLabel}
          >
            {partTypeLabel}
          </div>
        )}
      </div>
    </a>
  );
}

/**
 * Compose the vehicle fitment line "Toyota • Vios • 2018-2021".
 *
 * Rules:
 *   - missing brand   → return null (no model/year is meaningful w/o brand)
 *   - missing model   → "Toyota • 2018-2021"
 *   - missing year    → "Toyota • Vios"
 *   - yearFrom == yearTo → "Toyota • Vios • 2018"
 *   - missing both    → "Toyota"
 */
export function formatVehicleLine(p) {
  if (!p) return null;
  const brand = (p.brand || "").trim();
  const model = (p.model || "").trim();
  if (!brand && !model) return null;

  const year = formatYearRange(p.yearFrom, p.yearTo);
  const parts = [brand, model, year].filter((s) => s && s.length > 0);
  return parts.length > 0 ? parts.join(" • ") : null;
}

const TRUST_TONES = {
  emerald: "bg-emerald-50/90 text-emerald-700 ring-emerald-200",
  blue:    "bg-blue-50/90 text-blue-700 ring-blue-200",
  amber:   "bg-amber-50/90 text-amber-700 ring-amber-200",
  gray:    "bg-white/85 text-gray-700 ring-gray-200",
};

function formatYearRange(yFrom, yTo) {
  const a = Number.isFinite(Number(yFrom)) ? Number(yFrom) : null;
  const b = Number.isFinite(Number(yTo)) ? Number(yTo) : null;
  if (!a && !b) return "";
  if (a && b) return a === b ? String(a) : `${a}-${b}`;
  return String(a || b);
}
