"use client";

import { useEffect, useMemo, useState } from "react";
import { useShopFilterParams } from "@/lib/shopsite/useShopFilterParams";
import { useDebouncedValue } from "@/lib/shopsite/useDebouncedValue";

/**
 * Filter + search row used on the shop home + products page.
 *
 * Phase polish: state now lives in the URL.
 *
 *   Brand / Model / Year select change → router.push immediately
 *   Search input                       → debounced 300ms, then router.push
 *   Clear (×)                          → strip that single param
 *   Submit                             → no-op (the URL is already in sync)
 *
 * `fitments` is server-fetched from `/api/public/shops/<slug>/fitments`
 * so the dropdowns only ever offer brands/models the shop actually has
 * stock for. When `fitments` is absent (shop-demo pages, or a slow
 * cache miss) we degrade to the static `defaultYears` list and empty
 * brand/model options.
 *
 * Selecting a brand re-narrows the model dropdown to that brand's
 * models; clearing the brand exposes the full union again.
 */
export default function ShopFilters({ fitments, basePath = "" }) {
  const { params, setParam, setParams } = useShopFilterParams({ basePath });

  const brand = params.brand || "";
  const model = params.model || "";
  const year = params.year || "";

  // The server params are the source of truth; local state only exists
  // for the search input so we can debounce it before pushing.
  const [searchInput, setSearchInput] = useState(params.q || "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // Sync the input when the URL changes from another source (sidebar
  // click, browser back/forward). Avoids the stale-input bug.
  useEffect(() => {
    setSearchInput(params.q || "");
    // We intentionally only react to `params.q`; the local edit path
    // updates `searchInput` directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  useEffect(() => {
    if (debouncedSearch === (params.q || "")) return;
    setParam("q", debouncedSearch || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const brands = fitments?.brands || [];
  const modelsByBrand = fitments?.modelsByBrand || {};
  const allModels = useMemo(
    () => Array.from(new Set(Object.values(modelsByBrand).flat())).sort(),
    [modelsByBrand],
  );
  const models = brand ? modelsByBrand[brand] || [] : allModels;
  const years = fitments?.years && fitments.years.length
    ? fitments.years
    : Array.from({ length: 16 }, (_, i) => 2026 - i);

  const handleBrand = (next) => {
    // Changing brand invalidates the model selection (unless still valid).
    const nextModels = next ? modelsByBrand[next] || [] : allModels;
    const keepModel = model && nextModels.includes(model);
    setParams({ brand: next || null, model: keepModel ? model : null });
  };

  return (
    <form
      role="search"
      onSubmit={(e) => e.preventDefault()}
      className="bg-white rounded-2xl shadow-sm p-3 sm:p-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 sm:gap-3 items-stretch">
        <FilterSelect
          icon="🚗"
          value={brand}
          onChange={handleBrand}
          placeholder="Hãng xe"
          options={brands}
          className="lg:col-span-3"
        />
        <FilterSelect
          icon="🚙"
          value={model}
          onChange={(v) => setParam("model", v || null)}
          placeholder={brand ? "Dòng xe" : "Tên xe / Dòng xe"}
          options={models}
          className="lg:col-span-3"
        />
        <FilterSelect
          icon="📅"
          value={year}
          onChange={(v) => setParam("year", v || null)}
          placeholder="Năm sản xuất"
          options={years.map(String)}
          className="lg:col-span-2"
        />
        <div className="lg:col-span-4 flex">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm kiếm sản phẩm..."
            className="flex-1 min-w-0 rounded-l-xl border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e60012]/30 focus:border-[#e60012]"
            aria-label="Tìm kiếm sản phẩm"
          />
          <button
            type="submit"
            aria-label="Tìm kiếm"
            className="bg-[#e60012] hover:bg-[#c1000f] text-white px-4 rounded-r-xl"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  );
}

function FilterSelect({
  icon,
  value,
  onChange,
  placeholder,
  options = [],
  className = "",
}) {
  return (
    <label
      className={`relative flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[#e60012]/30 focus-within:border-[#e60012] ${className}`}
    >
      <span aria-hidden className="mr-2 text-gray-400 text-sm">
        {icon}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
        className="flex-1 min-w-0 appearance-none bg-transparent text-sm text-gray-800 focus:outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {value ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onChange("");
          }}
          aria-label={`Xóa ${placeholder}`}
          className="ml-1 text-gray-400 hover:text-[#e60012] text-xs"
        >
          ✕
        </button>
      ) : (
        <span aria-hidden className="text-gray-400 text-xs">
          ▾
        </span>
      )}
    </label>
  );
}
