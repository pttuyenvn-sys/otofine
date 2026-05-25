"use client";

import { useEffect, useState } from "react";
import { getShopProductFilterOptions } from "../../services/product.api";
import "./Product.css";

const emptyFilters = () => ({
  company: "",
  model: "",
  origin: "",
  keyword: "",
});

export default function ProductFilter({ onSearch }) {
  const [local, setLocal] = useState(emptyFilters);
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [filterLoadError, setFilterLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFilterLoadError("");
      try {
        const res = await getShopProductFilterOptions({
          company: local.company || undefined,
          model: local.model || undefined,
        });
        if (cancelled) return;
        setBrands(res.data?.brands || []);
        setModels(res.data?.models || []);
        setOrigins(res.data?.origins || []);
      } catch (err) {
        if (!cancelled) {
          setBrands([]);
          setModels([]);
          setOrigins([]);
          const msg =
            err?.response?.data?.message ||
            err?.message ||
            "Không tải được danh sách lọc";
          setFilterLoadError(msg);
          console.error("getShopProductFilterOptions:", err?.response?.status, err?.response?.data);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [local.company, local.model]);

  const applySearch = () => {
    onSearch({ ...local });
  };

  return (
    // Desktop only: the legacy 3-column AdminTimkiem grid is too wide
    // for phones. Mobile uses `ProductFilterMobile` (compact sheet).
    <div className="AdminTimkiem hidden lg:block">
      {filterLoadError ? (
        <div
          style={{
            color: "#b45309",
            fontSize: 13,
            marginBottom: 8,
            padding: "6px 10px",
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: 6,
          }}
        >
          {filterLoadError}
        </div>
      ) : null}
      <div className="TimkiemGrid">
        <div className="TimkiemColumn">
          <div className="TimkiemRow">
            <label>Hãng xe</label>
            <select
              value={local.company}
              onChange={(e) => {
                const company = e.target.value;
                setLocal((prev) => ({
                  ...prev,
                  company,
                  model: "",
                  origin: "",
                }));
              }}
            >
              <option value="">-- Tất cả --</option>
              {brands.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="TimkiemRow">
            <label>Loại xe</label>
            <select
              value={local.model}
              onChange={(e) => {
                const model = e.target.value;
                setLocal((prev) => ({
                  ...prev,
                  model,
                  origin: "",
                }));
              }}
            >
              <option value="">-- Tất cả --</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="TimkiemColumn">
          <div className="TimkiemRow">
            <label>Xuất xứ</label>
            <select
              value={local.origin}
              onChange={(e) =>
                setLocal((prev) => ({ ...prev, origin: e.target.value }))
              }
            >
              <option value="">-- Tất cả --</option>
              {origins.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div className="TimkiemRow">
            <label>Tìm kiếm</label>
            <input
              placeholder="Mã (tên) sản phẩm"
              value={local.keyword}
              onChange={(e) =>
                setLocal((prev) => ({ ...prev, keyword: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applySearch();
                }
              }}
            />
          </div>
        </div>

        <div className="TimkiemActions">
          <button type="button" className="btnTimKiem" onClick={applySearch}>
            🔍 Tìm kiếm
          </button>

          <button
            type="button"
            className="btnChonLai"
            onClick={() => {
              const reset = emptyFilters();
              setLocal(reset);
              onSearch(reset);
            }}
          >
            🔄 Chọn lại
          </button>
        </div>
      </div>
    </div>
  );
}
