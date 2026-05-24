"use client";

import { useShopFilterParams } from "@/lib/shopsite/useShopFilterParams";

/**
 * Pagination footer for the product grid.
 *
 * Phase polish: the "Xem thêm sản phẩm" button now uses
 * `router.push` (via `setParam("page", n, { keepPage: true })`) so
 * the address bar updates without a full page reload and the
 * filter/category state is preserved.
 *
 * When there are more than two pages we also show Prev/Next + a
 * compact "trang X/Y" indicator. Single-page result sets render
 * nothing (defensive: avoids visual noise after a tight filter).
 */
export default function ShopProductsPagination({ page, totalPages, basePath = "" }) {
  const { setParam } = useShopFilterParams({ basePath });
  const totalP = Math.max(1, Number(totalPages) || 1);
  const currentP = Math.max(1, Math.min(totalP, Number(page) || 1));

  if (totalP <= 1) return null;

  const goto = (p) => setParam("page", String(p), { keepPage: true });
  const hasPrev = currentP > 1;
  const hasNext = currentP < totalP;

  return (
    <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
      <span className="text-xs text-gray-500">
        Trang <span className="font-semibold text-gray-700">{currentP}</span>
        {" / "}
        {totalP.toLocaleString("vi-VN")}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => hasPrev && goto(currentP - 1)}
          disabled={!hasPrev}
          className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg text-gray-700 disabled:text-gray-300 disabled:border-gray-100 hover:border-[#e60012] hover:text-[#e60012] disabled:hover:border-gray-100 disabled:hover:text-gray-300"
        >
          ‹ Trước
        </button>
        <button
          type="button"
          onClick={() => hasNext && goto(currentP + 1)}
          disabled={!hasNext}
          className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg text-gray-700 disabled:text-gray-300 disabled:border-gray-100 hover:border-[#e60012] hover:text-[#e60012] disabled:hover:border-gray-100 disabled:hover:text-gray-300"
        >
          Sau ›
        </button>
      </div>
    </div>
  );
}
