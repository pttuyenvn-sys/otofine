"use client";

import { formatPrice } from "@/data/shop-demo";

/**
 * Vertical product card (Shopee-like).
 *
 * Click target: existing apex `/product/[id]` page. Phase 1 keeps
 * the link relative; Phase 2 will switch to absolute apex URLs once
 * the subdomain split is live (see audit/shop-public-seo-strategy.md
 * canonical contract).
 */
export default function ShopProductCard({ product }) {
  if (!product) return null;
  const href = product.productId
    ? `/product/${product.productId}`
    : "#";

  return (
    <a
      href={href}
      className="group flex flex-col rounded-2xl border border-gray-100 bg-white overflow-hidden hover:border-[#e60012] hover:shadow-md transition-all"
    >
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-400 text-xs">
            Không có ảnh
          </div>
        )}
        <button
          type="button"
          aria-label="Yêu thích"
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
        <h3 className="text-sm text-gray-800 leading-snug line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </h3>
        <div className="mt-2 text-[#e60012] font-bold text-base tabular-nums">
          {formatPrice(product.price)}
        </div>
        {product.category && (
          <div className="mt-1 inline-block self-start text-[11px] text-gray-600 bg-gray-100 rounded px-2 py-0.5">
            {product.category}
          </div>
        )}
      </div>
    </a>
  );
}
