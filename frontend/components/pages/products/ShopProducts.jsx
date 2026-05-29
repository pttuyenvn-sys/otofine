"use client";

/**
 * Seller products page — modern seller dashboard layout.
 * Business logic / APIs unchanged; display polish only.
 */

import { useState } from "react";

import ProductList from "./ProductList";
import SellerProductToolbar from "../../products/SellerProductToolbar";
import ProductFilterMobile from "../../products/ProductFilterMobile";
import ProductsActionsSheet from "./ProductsActionsSheet";
import SellerProductGovernanceTabs from "../../products/SellerProductGovernanceTabs";
import { LIFECYCLE_TABS } from "@/lib/seller/sellerProductGovernance";

import AddProductPopup from "../../popup/AddProductPopup";
import ImportImagePopup from "../../popup/ImportImagePopup";
import ImportProductPopup from "../../popup/ImportProductPopup";

import axiosClient from "../../../api/axiosClient";
import "./Product.css";

const defaultAppliedFilters = () => ({
  company: "",
  model: "",
  origin: "",
  keyword: "",
});

export default function ShopProducts() {
  const [appliedFilters, setAppliedFilters] = useState(defaultAppliedFilters);
  const [lifecycle, setLifecycle] = useState("all");
  const [governanceStats, setGovernanceStats] = useState({});
  const [listLimit, setListLimit] = useState(20);

  const [showAddPopup, setShowAddPopup] = useState(false);
  const [showImportImagePopup, setShowImportImagePopup] = useState(false);
  const [showImportProductPopup, setShowImportProductPopup] = useState(false);
  const [showActionsSheet, setShowActionsSheet] = useState(false);

  const triggerReloadProducts = () => {
    window.dispatchEvent(new Event("reload-products"));
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm("Bạn chắc chắn muốn ẩn sản phẩm này?")) return;
    await axiosClient.delete(`/products/${id}`);
    triggerReloadProducts();
  };

  const handleAddSuccess = () => {
    setAppliedFilters(defaultAppliedFilters());
    triggerReloadProducts();
  };

  const [exporting, setExporting] = useState(false);

  const handleExportExcel = async () => {
    try {
      setExporting(true);

      const res = await axiosClient.get("/product-export/export", {
        responseType: "blob",
      });

      if (res.status !== 200) {
        throw new Error("Export failed");
      }

      const url = window.URL.createObjectURL(new Blob([res.data]));

      const a = document.createElement("a");
      a.href = url;

      const fileName = `products_${Date.now()}.xlsx`;
      a.download = fileName;

      a.click();

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error(err);
      alert("Xuất file thất bại!");
    } finally {
      setExporting(false);
    }
  };

  const sheetItems = [
    {
      icon: "🖼️",
      label: "Import Ảnh",
      subtitle: "Tải ảnh theo PartNumber",
      onClick: () => setShowImportImagePopup(true),
    },
    {
      icon: "📥",
      label: "Import Sản phẩm",
      subtitle: "Tải file Excel sản phẩm",
      onClick: () => setShowImportProductPopup(true),
    },
    {
      icon: "📤",
      label: exporting ? "Đang xuất…" : "Kết xuất Excel",
      subtitle: "Tải toàn bộ sản phẩm",
      onClick: handleExportExcel,
      disabled: exporting,
    },
  ];

  const mobileTabs = LIFECYCLE_TABS.map((t) =>
    t.key === "rejected" ? { ...t, label: "Từ chối" } : t.key === "hidden" ? { ...t, label: "Ẩn" } : t,
  );

  return (
    <div className="AdminChitiet seller-products-page">
      <div className="seller-dash-header hidden lg:flex">
        <div>
          <h2 className="seller-dash-header-title">Sản phẩm</h2>
          <p className="seller-dash-header-sub">Quản lý danh mục và trạng thái kiểm duyệt</p>
        </div>

        <div className="seller-dash-header-actions">
          <button type="button" className="seller-dash-btn seller-dash-btn--primary" onClick={() => setShowAddPopup(true)}>
            + Thêm mới
          </button>
          <button type="button" className="seller-dash-btn seller-dash-btn--ghost" onClick={() => setShowImportImagePopup(true)}>
            Import ảnh
          </button>
          <button type="button" className="seller-dash-btn seller-dash-btn--ghost" onClick={() => setShowImportProductPopup(true)}>
            Import SP
          </button>
          <button type="button" className="seller-dash-btn seller-dash-btn--ghost" onClick={handleExportExcel} disabled={exporting}>
            {exporting ? "Đang xuất…" : "Xuất Excel"}
          </button>
        </div>
      </div>

      <div className="lg:hidden flex items-center gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-gray-900 truncate">Sản phẩm</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowAddPopup(true)}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold active:bg-emerald-700"
        >
          <span aria-hidden>＋</span>
          Thêm
        </button>
        <button
          type="button"
          aria-label="Hành động khác"
          onClick={() => setShowActionsSheet(true)}
          className="w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-700 inline-flex items-center justify-center text-lg leading-none"
        >
          ⋮
        </button>
      </div>

      <SellerProductToolbar
        appliedFilters={appliedFilters}
        onFiltersChange={setAppliedFilters}
        lifecycle={lifecycle}
        onLifecycleChange={setLifecycle}
        stats={governanceStats}
        limit={listLimit}
        onLimitChange={setListLimit}
      />

      <div className="lg:hidden px-0.5 mb-2">
        <ProductFilterMobile onSearch={setAppliedFilters} />
        <SellerProductGovernanceTabs
          value={lifecycle}
          onChange={setLifecycle}
          stats={governanceStats}
          tabs={mobileTabs}
        />
      </div>

      <ProductList
        appliedFilters={appliedFilters}
        lifecycle={lifecycle}
        limit={listLimit}
        onLimitChange={setListLimit}
        governanceStats={governanceStats}
        onGovernanceStats={setGovernanceStats}
        onDelete={handleDeleteProduct}
      />

      <ProductsActionsSheet
        open={showActionsSheet}
        onClose={() => setShowActionsSheet(false)}
        items={sheetItems}
      />

      {showAddPopup && (
        <AddProductPopup
          onClose={() => setShowAddPopup(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      {showImportImagePopup && (
        <ImportImagePopup
          show={showImportImagePopup}
          onClose={() => setShowImportImagePopup(false)}
        />
      )}

      {showImportProductPopup && (
        <ImportProductPopup
          onClose={() => setShowImportProductPopup(false)}
          onSuccess={triggerReloadProducts}
        />
      )}
    </div>
  );
}
