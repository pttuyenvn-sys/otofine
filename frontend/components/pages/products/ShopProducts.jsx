"use client";

// Shop products: popup sửa/xem ảnh trong ProductList (AddProductPopup)
import { useState } from "react";

import ProductList from "./ProductList";
import ProductFilter from "../../products/ProductFilter";

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

  return (
    <div className="AdminChitiet">
      <div className="AdminTieude">
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

      <ProductFilter onSearch={setAppliedFilters} />

      <ProductList appliedFilters={appliedFilters} onDelete={handleDeleteProduct} />

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
