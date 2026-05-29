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
  onResubmit,
  resubmittingId = null,
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
    <div className="seller-dash-mobile-list-wrap">
      <div className="seller-dash-mobile-bulk-bar">
        <label className="seller-dash-mobile-bulk-label">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) =>
              onSelectChange(e.target.checked ? data.map((p) => p.id) : [])
            }
            className="seller-dash-mobile-bulk-check"
          />
          {selectedIds.length > 0
            ? `Đã chọn ${selectedIds.length}/${data.length}`
            : `Chọn tất cả (${data.length})`}
        </label>
        <span className="seller-dash-mobile-bulk-count">{data.length} mục</span>
      </div>

      <ul className="seller-dash-mobile-list">
        {data.map((p) => (
          <ProductMobileCard
            key={p.id}
            product={p}
            selected={selectedIds.includes(p.id)}
            onSelectToggle={toggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onResubmit={onResubmit}
            resubmittingId={resubmittingId}
          />
        ))}
      </ul>
    </div>
  );
}
