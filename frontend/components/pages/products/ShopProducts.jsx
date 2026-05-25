"use client";

/**
 * Seller products page.
 *
 * Mobile UX pass:
 *   - Desktop toolbar is unchanged (Thêm + Import Ảnh + Import Sản
 *     phẩm + Kết xuất Excel inline).
 *   - Mobile (< lg) compresses to `[ + Thêm ] [ ⋮ ]` where the kebab
 *     opens a bottom-sheet hosting the three secondary actions. This
 *     preserves every action; nothing is removed.
 *   - Filter row swaps to a compact search input + filter sheet via
 *     `ProductFilterMobile`.
 *
 * No business logic / API changes — the popup components, axios
 * client, export pipeline, and reload-products event bus are all
 * untouched.
 */

import { useState } from "react";

import ProductList from "./ProductList";
import ProductFilter from "../../products/ProductFilter";
import ProductFilterMobile from "../../products/ProductFilterMobile";
import ProductsActionsSheet from "./ProductsActionsSheet";

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

  const [showAddPopup, setShowAddPopup] = useState(false);
  const [showImportImagePopup, setShowImportImagePopup] = useState(false);
  const [showImportProductPopup, setShowImportProductPopup] = useState(false);
  const [showActionsSheet, setShowActionsSheet] = useState(false);

  const triggerReloadProducts = () => {
    window.dispatchEvent(new Event("reload-products"));
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm("Bạn chắc chắn muốn xóa sản phẩm này?")) return;
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

  return (
    <div className="AdminChitiet">
      {/* Desktop toolbar — unchanged from the legacy layout. */}
      <div className="AdminTieude hidden lg:flex">
        <h2 className="TieudeText">Sản phẩm</h2>

        <div className="TieudeButtons">
          <button className="btn btn-add" onClick={() => setShowAddPopup(true)}>
            + Thêm mới
          </button>

          <button
            className="btn btn-import-img"
            onClick={() => setShowImportImagePopup(true)}
          >
            + Import Ảnh
          </button>

          <button
            className="btn btn-import-product"
            onClick={() => setShowImportProductPopup(true)}
          >
            + Import Sản phẩm
          </button>

          <button
            className="btn btn-export"
            onClick={handleExportExcel}
            disabled={exporting}
          >
            {exporting ? "Đang xuất..." : "Kết xuất Excel"}
          </button>
        </div>
      </div>

      {/* Mobile toolbar — primary CTA + overflow menu. */}
      <div className="lg:hidden flex items-center gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-gray-900 truncate">
            Sản phẩm
          </h2>
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

      {/* Filters — desktop and mobile renderers each scope themselves
          with hidden/lg:hidden so only one mounts at a time. */}
      <ProductFilter onSearch={setAppliedFilters} />
      <ProductFilterMobile onSearch={setAppliedFilters} />

      <ProductList appliedFilters={appliedFilters} onDelete={handleDeleteProduct} />

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
