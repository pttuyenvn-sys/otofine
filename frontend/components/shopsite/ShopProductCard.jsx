"use client";

import { formatPrice } from "@/data/shop-demo";
import { apexProductUrl } from "@/lib/apexOrigin";
import { toThumb400 } from "@/lib/imageVariants";
import { deriveProductTrustBadge } from "@/lib/shopsite/productTrust";
import {
  deriveProductInventorySignals,
  INVENTORY_SIGNAL_TONES,
} from "@/lib/shopsite/productInventorySignals";
import { ShopsiteEvents, trackShopsiteEvent } from "@/lib/shopsite/shopsiteAnalytics";
import { buildProductImageAlt } from "@/lib/seo/buildProductImageAlt";
import ShopImage from "./ShopImage";

/**
 * Decoupled launcher for the page-level Quick-RFQ modal.
 *
 * The product card lives inside an `<a>` (for SEO + middle-click +
 * cmd-click open-in-new-tab to keep working) so we can't drop a
 * nested `<button>` that owns modal state. Instead the card
 * dispatches a CustomEvent that a single page-level
 * `<ShopQuickRfqLauncher>` (or any future listener) picks up. This
 * keeps zero React context plumbing and zero per-card modal mounts.
 */
function openQuickRfqEvent(detail) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("shopsite:openQuickRfq", { detail }),
    );
  } catch {/* old WebView */}
}

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
export default function ShopProductCard({
  product,
  shopSlug,
  priority = false,
  shopPhone = null,
}) {
  if (!product) return null;
  const displayTitle = product.displayTitle || product.productIdentity?.h1 || "Sản phẩm";
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
  // Conversion engine — "Mới đăng" / "Cập nhật hôm nay" inventory
  // signal. Pure derivation from createdAt/updatedAt; the helper
  // returns [] when the data is missing so cards without timestamps
  // render exactly as before (no fake "recently updated" claim).
  const inventorySignals = deriveProductInventorySignals(product);
  const primarySignal = inventorySignals[0] || null;

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
      className="group flex flex-col rounded-2xl border border-gray-100 bg-white overflow-hidden hover:border-[#e60012] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150"
    >
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <ShopImage
          src={toThumb400(product.image) || ""}
          alt={buildProductImageAlt(product)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          fallbackClassName="h-full w-full"
          priority={priority}
          dimensionLayout="thumb400"
        />
        {trustBadge && (
          <span
            className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ring-1 backdrop-blur-sm ${TRUST_TONES[trustBadge.tone] || TRUST_TONES.gray}`}
            title={trustBadge.label}
          >
            {trustBadge.label}
          </span>
        )}
        {primarySignal && (
          <span
            className={`absolute ${trustBadge ? "top-9" : "top-2"} left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ring-1 backdrop-blur-sm ${INVENTORY_SIGNAL_TONES[primarySignal.tone] || INVENTORY_SIGNAL_TONES.gray}`}
            title={primarySignal.label}
          >
            {primarySignal.label}
          </span>
        )}
        {/*
          Desktop hover quick-info: a one-line "Xem chi tiết →" pill
          that slides up over the image bottom on hover, giving the
          buyer a clear affordance the card is clickable WITHOUT
          inventing fake stock/shipping data. Hidden on touch / <sm
          (tap is the affordance there).
        */}
        <span
          aria-hidden
          className="hidden sm:inline-flex absolute inset-x-0 bottom-0 items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-white bg-gradient-to-t from-black/75 via-black/55 to-transparent opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150"
        >
          Xem chi tiết
          <svg
            viewBox="0 0 24 24"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        <button
          type="button"
          aria-label={`Lưu sản phẩm ${displayTitle}`.trim()}
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

      {/*
        Card hierarchy (storefront v4, mobile + desktop):
          image → name (2-line) → fitment line → price (bold) → CTA.
        Putting the fitment line immediately under the title lets
        the buyer confirm "this fits my car" before their eye reaches
        the price — the canonical marketplace-parts hierarchy. The
        fitment line stays compact (single truncated line, ~1 px
        smaller than the title, muted gray) so it never competes with
        the price's visual weight. Desktop appends the legacy "Loại
        hàng" chip after the price as an additional context signal.
      */}
      <div className="p-2 sm:p-3 flex-1 flex flex-col">
        <h3 className="text-[13px] sm:text-sm text-gray-900 leading-snug line-clamp-2 min-h-[2.25rem] sm:min-h-[2.5rem]">
          {displayTitle}
        </h3>

        {/* Fitment line — single truncated line on every breakpoint.
            Sits directly under the title so the buyer can confirm
            applicability before reading the price. When there is no
            fitment data we render a transparent spacer on desktop to
            keep card heights consistent across the grid; mobile drops
            the spacer entirely so empty-fitment cards stay compact. */}
        {fitmentLine ? (
          <p
            className="mt-0.5 sm:mt-1 text-[11px] sm:text-[12px] text-gray-500 truncate"
            title={fitmentLine}
          >
            {fitmentLine}
          </p>
        ) : (
          <p
            className="hidden sm:block mt-1 text-[12px] text-transparent select-none"
            aria-hidden
          >
            &nbsp;
          </p>
        )}

        <div className="mt-1 sm:mt-1 text-[#e60012] font-extrabold text-[15px] sm:text-base tabular-nums">
          {formatPrice(product.price)}
        </div>

        {/* Part-type chip — desktop only; mobile suppresses to keep
            the card visually quieter and let the CTA row dominate. */}
        {partTypeLabel && (
          <div
            className="hidden sm:inline-block self-start mt-1.5 text-[11px] text-gray-600 bg-gray-100 rounded px-2 py-0.5 max-w-full truncate"
            title={partTypeLabel}
          >
            {partTypeLabel}
          </div>
        )}

        {/* Quick-contact mini row. Buttons live inside the parent
            anchor so we MUST cancel the navigation in their handler.
            Each button stops propagation + preventsDefault so a tap
            on the CTA never accidentally navigates to the product
            detail page. */}
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openQuickRfqEvent({
                source: "product_card",
                shopSlug,
                productId: product.productId || product.id || null,
                part: displayTitle,
                displayTitle,
                vehicle: fitmentLine || "",
              });
            }}
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-[#e60012] hover:bg-[#c1000f] text-white text-[11px] sm:text-[12px] font-semibold px-2 py-1.5 shadow-sm"
            aria-label="Hỏi nhanh về sản phẩm"
          >
            <ChatIconMini />
            Hỏi nhanh
          </button>
          {shopPhone && (
            <a
              href={`tel:${shopPhone}`}
              onClick={(e) => {
                e.stopPropagation();
                if (typeof window !== "undefined") {
                  trackShopsiteEvent(ShopsiteEvents.PHONE_CLICK, {
                    shopSlug,
                    source: "product_card",
                  });
                }
              }}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 w-9 h-7 sm:h-[30px] shrink-0"
              aria-label="Gọi shop"
              title="Gọi shop"
            >
              <PhoneIconMini />
            </a>
          )}
        </div>
      </div>
    </a>
  );
}

function ChatIconMini() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function PhoneIconMini() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
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
