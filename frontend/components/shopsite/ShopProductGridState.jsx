"use client";

import { useShopFilterParams } from "@/lib/shopsite/useShopFilterParams";

/**
 * Empty / loading / active-chips presentation primitives for the
 * storefront product grid. Kept in one file because they share the
 * same URL-state hook and CSS atoms.
 */

/** Skeleton grid — matches the real grid's responsive cols + aspect. */
export function ShopProductGridSkeleton({ count = 10 }) {
  return (
    <div
      aria-hidden
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-100 bg-white overflow-hidden"
        >
          <div className="aspect-square bg-gray-100 animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-4 w-4/5 bg-gray-100 animate-pulse rounded" />
            <div className="h-3 w-3/5 bg-gray-100 animate-pulse rounded" />
            <div className="h-5 w-2/5 bg-gray-100 animate-pulse rounded mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty illustration + Vietnamese copy. Used when the active filter
 * matrix produces zero items. Includes a one-click "Reset bộ lọc"
 * action so the user isn't stuck.
 */
export function ShopProductsEmpty({ basePath = "" }) {
  const { clearAll } = useShopFilterParams({ basePath });
  return (
    <div className="py-16 px-6 flex flex-col items-center text-center">
      <svg
        viewBox="0 0 120 100"
        width="120"
        height="100"
        aria-hidden
        className="mb-4"
      >
        <defs>
          <linearGradient id="boxg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f8fafc" />
            <stop offset="1" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
        <rect x="22" y="36" width="76" height="50" rx="6" fill="url(#boxg)" stroke="#cbd5e1" strokeWidth="1.5" />
        <path d="M22 46h76" stroke="#cbd5e1" strokeWidth="1.5" />
        <path d="M48 24l-16 12h56l-16-12z" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
        <circle cx="60" cy="62" r="11" fill="#fff" stroke="#e60012" strokeWidth="2" />
        <line x1="68" y1="70" x2="76" y2="78" stroke="#e60012" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <h3 className="text-base font-semibold text-gray-800">
        Không tìm thấy sản phẩm phù hợp
      </h3>
      <p className="text-sm text-gray-500 mt-1 max-w-sm">
        Hãy thử thay đổi bộ lọc, hoặc xóa toàn bộ điều kiện để xem tất cả sản phẩm của shop.
      </p>
      <button
        type="button"
        onClick={clearAll}
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-white bg-[#e60012] hover:bg-[#c1000f] px-4 py-2 rounded-xl"
      >
        Xóa toàn bộ bộ lọc
      </button>
    </div>
  );
}

/**
 * A compact, removable chip for each active filter. Lets the user see
 * "what am I filtering by right now" at a glance, and clear a single
 * dimension without diving back into the dropdowns.
 *
 * `categoriesById` lets us resolve `category` slug → human name.
 */
export function ShopActiveFilterChips({ basePath = "", categoriesBySlug = {} }) {
  const { params, setParam, clearAll } = useShopFilterParams({ basePath });

  const chips = [];
  if (params.category) {
    const cat = categoriesBySlug[params.category];
    chips.push({
      key: "category",
      label: cat ? cat.name : params.category,
      onRemove: () => setParam("category", null),
    });
  }
  if (params.brand)
    chips.push({ key: "brand", label: params.brand, onRemove: () => setParam("brand", null) });
  if (params.model)
    chips.push({ key: "model", label: params.model, onRemove: () => setParam("model", null) });
  if (params.year)
    chips.push({ key: "year", label: `Năm ${params.year}`, onRemove: () => setParam("year", null) });
  if (params.q)
    chips.push({ key: "q", label: `"${params.q}"`, onRemove: () => setParam("q", null) });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500">Đang lọc:</span>
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 text-xs bg-red-50 text-[#e60012] rounded-full pl-2.5 pr-1 py-1 border border-red-100"
        >
          {c.label}
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Xóa lọc ${c.label}`}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-red-100"
          >
            ✕
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="text-xs text-gray-500 hover:text-[#e60012] underline ml-1"
      >
        Xóa tất cả
      </button>
    </div>
  );
}
