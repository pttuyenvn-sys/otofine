"use client";

// Danh sách SP shop: sửa qua AddProductPopup ở con, không EditProductPopup ở cha
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  getProductsByShop,
  deleteProducts,
} from "../../../services/product.api";
import ProductTable from "../../products/ProductTable";
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
      <div style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn-delete-all"
          disabled={!selectedIds.length}
          onClick={handleDeleteAll}
        >
          Xóa All
        </button>
      </div>

      <div
        style={{
          marginBottom: 10,
          display: "flex",
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

      {loading ? (
        <div>Đang tải...</div>
      ) : (
        <ProductTable
          data={data}
          selectedIds={selectedIds}
          onSelectChange={setSelectedIds}
          onEdit={handleEdit}
          onDelete={onDelete}
        />
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
