"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  getProductsByShop,
  deleteProducts,
  getShopGovernanceStats,
  resubmitProductForReview,
} from "../../../services/product.api";
import ProductTable from "../../products/ProductTable";
import ProductMobileList from "./ProductMobileList";
import AddProductPopup from "../../popup/AddProductPopup";
import SellerProductStatsCards from "../../products/SellerProductStatsCards";
import SellerProductPagination from "../../products/SellerProductPagination";
import { sellerToast } from "../../ui/SellerToaster";
import "./Product.css";

export default function ProductList({
  appliedFilters = {},
  lifecycle = "all",
  limit: limitProp = 20,
  onLimitChange,
  governanceStats = {},
  onGovernanceStats,
  onDelete,
}) {
  const [data, setData] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(limitProp);
  const [total, setTotal] = useState(0);
  const [resubmittingId, setResubmittingId] = useState(null);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const [editingProduct, setEditingProduct] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    setLimit(limitProp);
  }, [limitProp]);

  const loadStats = useCallback(async () => {
    try {
      const res = await getShopGovernanceStats();
      onGovernanceStats?.(res.data || {});
    } catch (err) {
      console.error("Load governance stats error:", err);
    }
  }, [onGovernanceStats]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getProductsByShop({
        company: appliedFilters.company || undefined,
        model: appliedFilters.model || undefined,
        origin: appliedFilters.origin || undefined,
        keyword: appliedFilters.keyword || undefined,
        lifecycle: lifecycle && lifecycle !== "all" ? lifecycle : undefined,
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
  }, [appliedFilters, lifecycle, page, limit]);

  useLayoutEffect(() => {
    setPage(1);
  }, [
    appliedFilters.company,
    appliedFilters.model,
    appliedFilters.origin,
    appliedFilters.keyword,
    lifecycle,
    limit,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const reload = () => {
      loadData();
      loadStats();
    };
    window.addEventListener("reload-products", reload);
    return () => window.removeEventListener("reload-products", reload);
  }, [loadData, loadStats]);

  const handleLimitChange = (next) => {
    setLimit(next);
    onLimitChange?.(next);
    setPage(1);
  };

  const handleDeleteAll = async () => {
    if (!selectedIds.length) {
      alert("Vui lòng chọn sản phẩm cần ẩn.");
      return;
    }

    const ok = window.confirm(`Ẩn ${selectedIds.length} sản phẩm đã chọn?`);
    if (!ok) return;

    try {
      await deleteProducts(selectedIds);
      setSelectedIds([]);
      loadData();
      loadStats();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Ẩn không thành công. Thử lại sau.");
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowEdit(true);
  };

  const handleResubmit = async (product) => {
    if (!product?.id) return;
    try {
      setResubmittingId(product.id);
      await resubmitProductForReview(product.id);
      sellerToast.success("Đã gửi duyệt lại");
      if (editingProduct?.id === product.id) {
        setEditingProduct((prev) =>
          prev
            ? {
                ...prev,
                sellerLifecycle: "pending_review",
                moderationStatus: "pending_review",
                lifecycleMeta: undefined,
              }
            : prev,
        );
      }
      loadData();
      loadStats();
    } catch (err) {
      sellerToast.error(err?.response?.data?.message || "Gửi duyệt lại thất bại");
    } finally {
      setResubmittingId(null);
    }
  };

  const paginationProps = {
    page,
    totalPages,
    total,
    limit,
    onPageChange: setPage,
    onLimitChange: handleLimitChange,
    className: "seller-dash-pagination--footer",
    compact: false,
  };

  return (
    <div className="ProductListWrap seller-dash-list">
      <SellerProductStatsCards stats={governanceStats} />

      <div className="seller-dash-list-bar">
        <div className="seller-dash-list-bar-left">
          {selectedIds.length > 0 ? (
            <span className="seller-dash-selection-count">
              Đã chọn <strong>{selectedIds.length}</strong>
            </span>
          ) : (
            <span className="seller-dash-selection-hint">Chọn sản phẩm để thao tác hàng loạt</span>
          )}
        </div>
        <button
          type="button"
          className="seller-dash-bulk-hide"
          disabled={!selectedIds.length}
          onClick={handleDeleteAll}
        >
          🗑 Ẩn đã chọn{selectedIds.length ? ` (${selectedIds.length})` : ""}
        </button>
      </div>

      {!loading ? (
        <div className="seller-dash-list-pagination seller-dash-list-pagination--top">
          <SellerProductPagination {...paginationProps} />
        </div>
      ) : null}

      <div className="seller-dash-list-content">
        {loading ? (
          <>
            <div className="seller-dash-loading seller-dash-loading--desktop">Đang tải sản phẩm…</div>
            <ul className="seller-dash-mobile-list seller-dash-loading--mobile" aria-busy="true" aria-label="Đang tải sản phẩm">
              {[0, 1, 2, 3].map((i) => (
                <li
                  key={i}
                  className="seller-dash-mobile-skeleton"
                >
                  <div className="seller-dash-mobile-skeleton-thumb" />
                  <div className="seller-dash-mobile-skeleton-body">
                    <div className="seller-dash-mobile-skeleton-line seller-dash-mobile-skeleton-line--lg" />
                    <div className="seller-dash-mobile-skeleton-line" />
                    <div className="seller-dash-mobile-skeleton-line seller-dash-mobile-skeleton-line--sm" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="seller-dash-desktop-panel">
              <ProductTable
                data={data}
                selectedIds={selectedIds}
                onSelectChange={setSelectedIds}
                onEdit={handleEdit}
                onDelete={onDelete}
                onResubmit={handleResubmit}
                resubmittingId={resubmittingId}
              />
              <div className="seller-dash-list-pagination seller-dash-list-pagination--desktop">
                <SellerProductPagination {...paginationProps} />
              </div>
            </div>

            <div className="seller-dash-mobile-list-panel">
              <ProductMobileList
                data={data}
                selectedIds={selectedIds}
                onSelectChange={setSelectedIds}
                onEdit={handleEdit}
                onDelete={onDelete}
                onResubmit={handleResubmit}
                resubmittingId={resubmittingId}
              />
            </div>
          </>
        )}
      </div>

      {!loading ? (
        <div className="seller-dash-list-pagination seller-dash-list-pagination--bottom">
          <SellerProductPagination {...paginationProps} />
        </div>
      ) : null}

      {showEdit && editingProduct && (
        <AddProductPopup
          product={editingProduct}
          onClose={() => {
            setShowEdit(false);
            setEditingProduct(null);
          }}
          onSuccess={() => {
            loadData();
            loadStats();
          }}
          onResubmit={handleResubmit}
          resubmitting={resubmittingId === editingProduct.id}
        />
      )}
    </div>
  );
}
