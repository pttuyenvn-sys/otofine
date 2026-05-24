"use client";

import ShopSection from "./ShopSection";
import { useShopFilterParams } from "@/lib/shopsite/useShopFilterParams";

const CATEGORY_ICONS = {
  "Nhớt động cơ": "🛢️",
  "Phụ tùng động cơ": "⚙️",
  "Hệ thống phanh": "🔧",
  "Đèn chiếu sáng": "💡",
  "Phụ kiện nội thất": "🪑",
  "Đồ chơi ô tô": "🎮",
  "Đồ điện - Công nghệ": "🔌",
};

/**
 * Right sidebar: category list with subtle icon column and a
 * "See all categories" footer link.
 *
 * Phase polish: every entry now triggers a `router.push` instead of
 * a full-page reload — this preserves the rest of the filter state
 * (brand, model, year, q) and keeps the address bar in sync without
 * a flash.
 *
 * Active highlight is derived from `useSearchParams()` so the chosen
 * category stays highlighted even when the parent server component
 * hasn't re-rendered yet (during the App Router transition window).
 *
 * `basePath` is the route prefix:
 *   - "" on a real shop subdomain (so URLs stay short)
 *   - "/shops/<slug>" on apex
 * — matched to what `getShopBasePath()` returns server-side.
 */
export default function ShopSidebar({
  categories = [],
  basePath = "/shop-demo",
}) {
  const { params, setParam, clearAll } = useShopFilterParams({ basePath });
  const activeSlug = params.category || "";

  return (
    <ShopSection
      title="Danh mục sản phẩm"
      className="h-full"
      bodyClassName="!p-0"
    >
      <ul className="divide-y divide-gray-100">
        <li>
          <button
            type="button"
            onClick={() => setParam("category", null)}
            className={`w-full text-left flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors ${
              !activeSlug ? "bg-red-50 text-[#e60012] font-medium" : ""
            }`}
          >
            <span className="flex items-center gap-3 text-sm">
              <span aria-hidden className="w-5 text-center">📦</span>
              Tất cả sản phẩm
            </span>
            <span aria-hidden className="text-gray-300">›</span>
          </button>
        </li>
        {categories.map((cat) => {
          const active = cat.slug === activeSlug;
          return (
            <li key={cat.id}>
              <button
                type="button"
                onClick={() => setParam("category", cat.slug)}
                className={`w-full text-left flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors ${
                  active ? "bg-red-50 text-[#e60012] font-medium" : "text-gray-800"
                }`}
                aria-pressed={active}
              >
                <span className="flex items-center gap-3 text-sm">
                  <span aria-hidden className="w-5 text-center">
                    {CATEGORY_ICONS[cat.name] || "•"}
                  </span>
                  {cat.name}
                </span>
                <span aria-hidden className="text-gray-300">›</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <button
          type="button"
          onClick={clearAll}
          className="text-sm text-[#e60012] font-medium inline-flex items-center gap-1 hover:underline"
        >
          Xóa bộ lọc
        </button>
      </div>
    </ShopSection>
  );
}
