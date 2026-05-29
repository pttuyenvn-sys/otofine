"use client";

import { useEffect, useState } from "react";
import { getShopProductFilterOptions } from "../../services/product.api";
import SellerProductGovernanceTabs from "./SellerProductGovernanceTabs";
import { LIFECYCLE_TABS } from "@/lib/seller/sellerProductGovernance";

const emptyFilters = () => ({
  company: "",
  model: "",
  origin: "",
  keyword: "",
});

export default function SellerProductToolbar({
  appliedFilters = {},
  onFiltersChange,
  lifecycle = "all",
  onLifecycleChange,
  stats = {},
  limit = 20,
  onLimitChange,
}) {
  const [local, setLocal] = useState(() => ({ ...emptyFilters(), ...appliedFilters }));
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [origins, setOrigins] = useState([]);

  useEffect(() => {
    setLocal((prev) => ({ ...prev, ...appliedFilters }));
  }, [
    appliedFilters.company,
    appliedFilters.model,
    appliedFilters.origin,
    appliedFilters.keyword,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getShopProductFilterOptions({
          company: local.company || undefined,
          model: local.model || undefined,
        });
        if (cancelled) return;
        setBrands(res.data?.brands || []);
        setModels(res.data?.models || []);
        setOrigins(res.data?.origins || []);
      } catch {
        if (!cancelled) {
          setBrands([]);
          setModels([]);
          setOrigins([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [local.company, local.model]);

  function commitFilters(next) {
    setLocal(next);
    onFiltersChange?.(next);
  }

  function applyKeyword() {
    commitFilters({ ...local });
  }

  function patchFilters(patch) {
    setLocal((prev) => {
      const next = { ...prev, ...patch };
      onFiltersChange?.(next);
      return next;
    });
  }

  return (
    <div className="seller-dash-toolbar hidden lg:block">
      <div className="seller-dash-toolbar-search">
        <span className="seller-dash-toolbar-search-icon" aria-hidden>
          🔍
        </span>
        <input
          type="search"
          value={local.keyword}
          onChange={(e) => setLocal((p) => ({ ...p, keyword: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyKeyword();
            }
          }}
          onBlur={applyKeyword}
          placeholder="Tìm kiếm sản phẩm theo mã hoặc tên…"
          aria-label="Tìm kiếm sản phẩm"
        />
      </div>

      <SellerProductGovernanceTabs
        value={lifecycle}
        onChange={onLifecycleChange}
        stats={stats}
        tabs={LIFECYCLE_TABS.map((t) =>
          t.key === "rejected" ? { ...t, label: "Từ chối" } : t.key === "hidden" ? { ...t, label: "Ẩn" } : t,
        )}
      />

      <div className="seller-dash-toolbar-filters">
        <select
          value={local.company}
          onChange={(e) => {
            const company = e.target.value;
            patchFilters({ company, model: "", origin: "" });
          }}
          aria-label="Hãng xe"
        >
          <option value="">Hãng xe</option>
          {brands.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={local.model}
          onChange={(e) => {
            const model = e.target.value;
            patchFilters({ model, origin: "" });
          }}
          aria-label="Loại xe"
        >
          <option value="">Loại xe</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={local.origin}
          onChange={(e) => patchFilters({ origin: e.target.value })}
          aria-label="Xuất xứ"
        >
          <option value="">Xuất xứ</option>
          {origins.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select
          value={limit}
          onChange={(e) => onLimitChange?.(Number(e.target.value))}
          aria-label="Số dòng mỗi trang"
          className="seller-dash-toolbar-limit"
        >
          <option value={20}>20 / trang</option>
          <option value={50}>50 / trang</option>
          <option value={100}>100 / trang</option>
        </select>

        <button
          type="button"
          className="seller-dash-toolbar-reset"
          onClick={() => commitFilters(emptyFilters())}
        >
          Đặt lại
        </button>
      </div>
    </div>
  );
}
