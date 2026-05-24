"use client";

import { useState } from "react";

/**
 * Filter + search row used on the shop home + products page.
 *
 * Phase 1: client-side state only, no API call. Phase 2 will swap
 * the change handlers to push to `/shop-demo/san-pham?brand=...&model=...`
 * and the products page will read from `useSearchParams`.
 */
export default function ShopFilters({
  brands = [],
  models = [],
  years = [],
}) {
  const defaultYears =
    years.length > 0
      ? years
      : Array.from({ length: 16 }, (_, i) => 2026 - i);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");

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
          onChange={setBrand}
          placeholder="Hãng xe"
          options={brands}
          className="lg:col-span-3"
        />
        <FilterSelect
          icon="🚙"
          value={model}
          onChange={setModel}
          placeholder="Tên xe / Dòng xe"
          options={models}
          className="lg:col-span-3"
        />
        <FilterSelect
          icon="📅"
          value={year}
          onChange={setYear}
          placeholder="Năm sản xuất"
          options={defaultYears.map(String)}
          className="lg:col-span-2"
        />
        <div className="lg:col-span-4 flex">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
        className="flex-1 min-w-0 appearance-none bg-transparent text-sm text-gray-800 focus:outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <span aria-hidden className="text-gray-400 text-xs">
        ▾
      </span>
    </label>
  );
}
