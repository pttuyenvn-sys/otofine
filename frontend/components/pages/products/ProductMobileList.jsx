"use client";

/**
 * Mobile-only stack of product cards.
 *
 * Renders below 1024px (Tailwind `lg`). Above that the page keeps the
 * legacy `<ProductTable>` so desktop sellers retain the dense, sortable
 * column layout they've used since day one.
 *
 * Selection state and action handlers come from the same parent
 * (`ProductList`) that feeds `ProductTable`, so:
 *   - "Xóa All" still works because checkbox selection maps to the
 *     same `selectedIds` array.
 *   - Edit / delete callbacks are identical — `ProductMobileCard`
 *     dispatches `onEdit(product)` / `onDelete(id)` exactly like the
 *     desktop row.
 */

import ProductMobileCard from "./ProductMobileCard";

export default function ProductMobileList({
  data = [],
  selectedIds = [],
  onSelectChange,
  onEdit,
  onDelete,
}) {
  const allChecked = data.length > 0 && selectedIds.length === data.length;

  function toggle(id) {
    onSelectChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  if (!data.length) {
    return (
      <div className="px-3 py-10 text-center text-sm text-gray-500 bg-white rounded-xl border border-dashed border-gray-200">
        Chưa có sản phẩm nào
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1 text-[12px] text-gray-500">
        <label className="inline-flex items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) =>
              onSelectChange(e.target.checked ? data.map((p) => p.id) : [])
            }
            className="w-4 h-4 accent-emerald-600"
          />
          {selectedIds.length > 0
            ? `Đã chọn ${selectedIds.length}/${data.length}`
            : `Chọn tất cả (${data.length})`}
        </label>
        <span className="tabular-nums">{data.length} mục</span>
      </div>

      <ul className="space-y-2">
        {data.map((p) => (
          <ProductMobileCard
            key={p.id}
            product={p}
            selected={selectedIds.includes(p.id)}
            onSelectToggle={toggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}
