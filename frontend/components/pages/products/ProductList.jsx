"use client";

// Danh sách SP shop: sửa qua AddProductPopup ở con, không EditProductPopup ở cha
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  getProductsByShop,
  deleteProducts,
} from "../../../services/product.api";
import ProductTable from "../../products/ProductTable";
import ProductMobileList from "./ProductMobileList";
import AddProductPopup from "../../popup/AddProductPopup";
import "./Product.css";

export default function ProductList({ appliedFilters = {}, onDelete }) {
  const [data, setData] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const pages = [];

  for (let i = 1; i <= totalPages; i++) {
    pages.push(i);
  }

  const [editingProduct, setEditingProduct] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getProductsByShop({
        company: appliedFilters.company || undefined,
        model: appliedFilters.model || undefined,
        origin: appliedFilters.origin || undefined,
        keyword: appliedFilters.keyword || undefined,
        page,
        limit,
      });
      setData(res.data.items || res.data || []);
      setTotal(Number(res.data.total) || 0);
    } catch (err) {
      console.error("Load products error:", err);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, limit]);

  useLayoutEffect(() => {
    setPage(1);
  }, [
    appliedFilters.company,
    appliedFilters.model,
    appliedFilters.origin,
    appliedFilters.keyword,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const reload = () => loadData();
    window.addEventListener("reload-products", reload);
    return () => window.removeEventListener("reload-products", reload);
  }, [loadData]);

  const handleDeleteAll = async () => {
    if (!selectedIds.length) {
      alert(
        "Vui lòng tick các sản phẩm cần xóa (hoặc tick đầu dòng để chọn cả trang).",
      );
      return;
    }

    const ok = window.confirm(`Xóa ${selectedIds.length} sản phẩm đã chọn?`);
    if (!ok) return;

    try {
      await deleteProducts(selectedIds);
      setSelectedIds([]);
      loadData();
    } catch (err) {
      console.error(err);
      alert(
        err?.response?.data?.message || "Xóa không thành công. Thử lại sau.",
      );
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowEdit(true);
  };

  return (
    <div className="ProductListWrap">
      {/* Bulk delete + selection summary — visible on both layouts. The
          desktop button keeps its legacy class so existing CSS rules
          apply; on mobile we mirror it as a compact pill so it's not
          oversized next to the new card stack. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="btn-delete-all hidden lg:inline-block"
          disabled={!selectedIds.length}
          onClick={handleDeleteAll}
        >
          Xóa All
        </button>
        <button
          type="button"
          className="lg:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:bg-gray-300 disabled:text-white"
          disabled={!selectedIds.length}
          onClick={handleDeleteAll}
        >
          🗑 Xóa{selectedIds.length ? ` (${selectedIds.length})` : ""}
        </button>
      </div>

      {/* Pagination + page-size — desktop layout (unchanged). */}
      <div
        className="hidden lg:flex"
        style={{
          marginBottom: 10,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          Hiển thị{" "}
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>{" "}
          sản phẩm / Tổng <b>{total}</b> sản phẩm
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
            ‹‹‹
          </button>

          {pages
            .slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))
            .map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPage(p)}
                style={{
                  minWidth: 32,
                  height: 32,
                  background: p === page ? "#1677ff" : "#fff",
                  color: p === page ? "#fff" : "#333",
                  border: "1px solid #d9d9d9",
                  cursor: "pointer",
                }}
              >
                {p}
              </button>
            ))}

          {page + 2 < totalPages && <span>...</span>}

          {page + 2 < totalPages && (
            <button type="button" onClick={() => setPage(totalPages)}>
              {totalPages}
            </button>
          )}

          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            ›››
          </button>
        </div>
      </div>

      {/* Mobile total + page-size selector — always visible whenever
          the seller has any data, so they can change page size and
          see "Tổng X sản phẩm · Trang Y/Z" at a glance. The legacy
          mobile bar showed only the static total; without a page-size
          control the seller could not surface more than 20 SKUs at a
          time on phones. */}
      <div className="lg:hidden flex items-center justify-between gap-2 mb-2 text-[12px] text-gray-500">
        <span>
          <b className="text-gray-700">{total.toLocaleString("vi-VN")}</b> sản phẩm
        </span>
        <div className="flex items-center gap-1.5">
          <label className="text-[12px] text-gray-500" htmlFor="prod-mobile-limit">Hiển thị</label>
          <select
            id="prod-mobile-limit"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="border border-gray-200 rounded px-1.5 py-0.5 text-[12px] bg-white text-gray-700"
            aria-label="Số sản phẩm mỗi trang"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <span className="tabular-nums">
          Trang <b className="text-gray-700">{page}</b>/{totalPages}
        </span>
      </div>

      {loading ? (
        <>
          {/* Desktop falls back to the simple "Đang tải…" hint to keep
              the legacy table area stable. Mobile gets a card-shaped
              skeleton so the seller sees the eventual layout
              immediately — no layout shift on first paint. */}
          <div className="hidden lg:block py-6 text-center text-sm text-gray-500">
            Đang tải…
          </div>
          <ul className="lg:hidden space-y-2" aria-busy="true" aria-label="Đang tải sản phẩm">
            {[0, 1, 2, 3].map((i) => (
              <li
                key={i}
                className="bg-white rounded-xl border border-gray-200 px-2.5 py-2.5 flex items-start gap-2.5 animate-pulse"
              >
                <div className="shrink-0 w-16 h-16 rounded-lg bg-gray-100" />
                <div className="flex-1 min-w-0">
                  <div className="h-3.5 w-3/4 rounded bg-gray-100 mb-2" />
                  <div className="h-3 w-2/3 rounded bg-gray-100 mb-2" />
                  <div className="flex gap-1.5">
                    <div className="h-4 w-16 rounded bg-gray-100" />
                    <div className="h-4 w-12 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="w-9 h-9 rounded-lg bg-gray-100" />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {/* Desktop table — unchanged. */}
          <div className="hidden lg:block">
            <ProductTable
              data={data}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              onEdit={handleEdit}
              onDelete={onDelete}
            />
          </div>

          {/* Mobile card stack — only mounted under lg. */}
          <div className="lg:hidden">
            <ProductMobileList
              data={data}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              onEdit={handleEdit}
              onDelete={onDelete}
            />
          </div>
        </>
      )}

      {/* Mobile pager — sits just below the list. Always rendered
          when the seller has any data so the "Trang X/Y" affordance
          stays visible and the next-page button is one tap away.
          Buttons disable themselves at the edges. */}
      {!loading && data.length > 0 && (
        <div className="lg:hidden mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(Math.max(1, page - 1))}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            ‹ Trước
          </button>
          <span className="text-[12px] text-gray-500 tabular-nums shrink-0">
            {page}/{totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Sau ›
          </button>
        </div>
      )}

      {showEdit && editingProduct && (
        <AddProductPopup
          product={editingProduct}
          onClose={() => {
            setShowEdit(false);
            setEditingProduct(null);
          }}
          onSuccess={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
}
