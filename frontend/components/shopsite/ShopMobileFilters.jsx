"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShopFilterParams } from "@/lib/shopsite/useShopFilterParams";
import { useDebouncedValue } from "@/lib/shopsite/useDebouncedValue";

/**
 * Mobile-only filter sheet.
 *
 *   <ShopMobileFilters fitments={…} basePath={…} />
 *
 * On mobile the original 4-input filter row (brand / model / year /
 * search) eats ~120px of vertical real estate before any product is
 * visible. This component collapses that into a single ~44px trigger
 * row:
 *
 *   [ 🔍 search input              ] [ ⚙︎ Bộ lọc · 2 ]
 *
 * The search input stays inline (most common path), and brand / model /
 * year live behind the "Bộ lọc" button which opens a bottom-sheet
 * containing the same selects. A small badge on the button counts
 * the number of active vehicle filters so the user knows their
 * current filter state without opening the sheet.
 *
 * Renders ONLY on phones (lg:hidden). Desktop continues to use the
 * existing inline <ShopFilters /> row — kept unchanged in
 * `ShopFilters.jsx`.
 *
 * Performance:
 *   - The sheet markup mounts only when open (no hidden subtree).
 *   - Scroll lock on body while open.
 *   - The search input pushes to the URL with the same 300ms debounce
 *     contract as the desktop component, so deep-linking + back/forward
 *     behave identically across breakpoints.
 *
 * URL state is the single source of truth (same `useShopFilterParams`
 * hook the desktop filters use). When this component and the desktop
 * filters co-exist, both reflect the same params and edits propagate
 * across breakpoints if the viewport is resized mid-session.
 */
export default function ShopMobileFilters({
  fitments,
  basePath = "",
  className = "",
}) {
  const { params, setParam, setParams } = useShopFilterParams({ basePath });

  const brand = params.brand || "";
  const model = params.model || "";
  const year = params.year || "";

  const [searchInput, setSearchInput] = useState(params.q || "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSearchInput(params.q || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  useEffect(() => {
    if (debouncedSearch === (params.q || "")) return;
    setParam("q", debouncedSearch || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const brands = fitments?.brands || [];
  const modelsByBrand = fitments?.modelsByBrand || {};
  const allModels = useMemo(
    () => Array.from(new Set(Object.values(modelsByBrand).flat())).sort(),
    [modelsByBrand],
  );
  const models = brand ? modelsByBrand[brand] || [] : allModels;
  const years =
    fitments?.years && fitments.years.length
      ? fitments.years
      : Array.from({ length: 16 }, (_, i) => 2026 - i);

  const activeCount = [brand, model, year].filter(Boolean).length;

  const handleBrand = (next) => {
    const nextModels = next ? modelsByBrand[next] || [] : allModels;
    const keepModel = model && nextModels.includes(model);
    setParams({ brand: next || null, model: keepModel ? model : null });
  };

  return (
    <div
      className={`lg:hidden bg-white rounded-xl shadow-sm ring-1 ring-gray-100 px-2 py-1.5 flex items-center gap-2 ${className}`}
    >
      <label className="flex-1 flex items-center bg-gray-50 rounded-lg px-2 py-1.5 ring-1 ring-transparent focus-within:ring-[#e60012]/40 focus-within:bg-white">
        <span aria-hidden className="text-gray-400 mr-1.5">
          <SearchIcon />
        </span>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Tìm sản phẩm…"
          aria-label="Tìm sản phẩm trong shop"
          className="flex-1 min-w-0 bg-transparent text-sm placeholder-gray-400 outline-none"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            aria-label="Xóa từ khóa"
            className="text-gray-400 hover:text-[#e60012] text-xs ml-1"
          >
            ✕
          </button>
        )}
      </label>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center gap-1 bg-gray-50 hover:bg-gray-100 ring-1 ring-gray-200 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <FilterIcon />
        <span>Lọc</span>
        {activeCount > 0 && (
          <span
            aria-label={`${activeCount} bộ lọc đang áp dụng`}
            className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#e60012] text-white text-[10px] font-semibold"
          >
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bộ lọc sản phẩm"
          className="fixed inset-0 z-50 flex flex-col justify-end"
        >
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[1px] animate-[fade-in_180ms_ease-out]"
          />

          <div
            className="relative bg-white rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.18)] max-h-[80vh] flex flex-col animate-[slide-up_220ms_cubic-bezier(0.2,0.7,0.2,1)]"
            style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
          >
            <div className="pt-2 pb-1 flex justify-center">
              <span aria-hidden className="block w-9 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-center justify-between px-4 pb-2 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">
                Lọc theo xe của bạn
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                className="text-gray-500 hover:text-[#e60012] p-1 -mr-1"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-3 space-y-3">
              <SheetSelect
                label="Hãng xe"
                value={brand}
                onChange={handleBrand}
                options={brands}
              />
              <SheetSelect
                label="Dòng xe"
                value={model}
                onChange={(v) => setParam("model", v || null)}
                options={models}
                placeholder={brand ? `Dòng xe của ${brand}` : "Tất cả dòng xe"}
              />
              <SheetSelect
                label="Năm sản xuất"
                value={year}
                onChange={(v) => setParam("year", v || null)}
                options={years.map(String)}
              />
            </div>

            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setParams({ brand: null, model: null, year: null })
                }
                className="text-sm text-gray-600 hover:text-[#e60012] font-medium"
              >
                Đặt lại
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm bg-[#e60012] text-white px-5 py-2 rounded-xl font-medium"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function SheetSelect({ label, value, onChange, options = [], placeholder }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-9 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#e60012]/30 focus:border-[#e60012]"
        >
          <option value="">{placeholder || `Tất cả ${label.toLowerCase()}`}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
        >
          ▾
        </span>
      </span>
    </label>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
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
  );
}

function FilterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
