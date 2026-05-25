"use client";

/**
 * Mobile-only product filter — compact search bar + bottom-sheet for
 * brand / model / origin. Mirrors `ProductFilter.jsx` but in a
 * phone-native shape:
 *
 *   ┌─────────────────────────────┐
 *   │ 🔍 [search box ]   [Lọc · 2] │
 *   └─────────────────────────────┘
 *
 * Tapping "Lọc" opens a bottom sheet with the same three dropdowns +
 * apply / reset buttons. Search input commits on Enter (or debounced
 * blur) just like the desktop filter — no business logic changes.
 *
 * Implementation:
 *   - Shares the same `/api/products/shop/filters` endpoint via
 *     `getShopProductFilterOptions` so brand/model/origin lists stay
 *     in sync with the desktop sidebar.
 *   - Calls the parent `onSearch(filters)` exactly the same way the
 *     desktop component does.
 *   - Bottom sheet body-locks scroll and supports ESC to close.
 */

import { useEffect, useRef, useState } from "react";
import { getShopProductFilterOptions } from "../../services/product.api";

const emptyFilters = () => ({
  company: "",
  model: "",
  origin: "",
  keyword: "",
});

function useBodyScrollLock(open) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

export default function ProductFilterMobile({ onSearch }) {
  const [local, setLocal] = useState(emptyFilters);
  const [committed, setCommitted] = useState(emptyFilters());
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  useBodyScrollLock(open);

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

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const activeCount =
    (committed.company ? 1 : 0) +
    (committed.model ? 1 : 0) +
    (committed.origin ? 1 : 0);

  function apply(filters) {
    setCommitted(filters);
    onSearch(filters);
  }

  function applyKeyword(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    apply({ ...local });
  }

  function applySheet() {
    apply({ ...local });
    setOpen(false);
  }

  function resetSheet() {
    const reset = emptyFilters();
    setLocal(reset);
    apply(reset);
    setOpen(false);
  }

  return (
    <div className="lg:hidden">
      {/* Compact search row — always visible above the product list */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            value={local.keyword}
            onChange={(e) =>
              setLocal((p) => ({ ...p, keyword: e.target.value }))
            }
            onKeyDown={applyKeyword}
            onBlur={() => {
              if (local.keyword !== committed.keyword) {
                apply({ ...local });
              }
            }}
            placeholder="Tìm theo mã / tên sản phẩm"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
          <span
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"
          >
            🔍
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-emerald-400"
          aria-label="Bộ lọc"
        >
          <span aria-hidden>☰</span>
          Lọc
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold leading-none">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end"
          role="dialog"
          aria-modal="true"
          aria-label="Bộ lọc sản phẩm"
        >
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative w-full bg-white rounded-t-2xl shadow-2xl pb-[max(env(safe-area-inset-bottom,0px),16px)] max-h-[80vh] overflow-y-auto">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Bộ lọc</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 text-xl leading-none px-2 -mr-2"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="px-4 pt-3 pb-1 space-y-3">
              <SheetSelect
                label="Hãng xe"
                value={local.company}
                onChange={(v) =>
                  setLocal((p) => ({ ...p, company: v, model: "", origin: "" }))
                }
                options={brands}
              />
              <SheetSelect
                label="Loại xe"
                value={local.model}
                onChange={(v) =>
                  setLocal((p) => ({ ...p, model: v, origin: "" }))
                }
                options={models}
              />
              <SheetSelect
                label="Xuất xứ"
                value={local.origin}
                onChange={(v) => setLocal((p) => ({ ...p, origin: v }))}
                options={origins}
              />
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3 mt-2 flex gap-2">
              <button
                type="button"
                onClick={resetSheet}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700"
              >
                Đặt lại
              </button>
              <button
                type="button"
                onClick={applySheet}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SheetSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-gray-600 mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-emerald-400"
      >
        <option value="">— Tất cả —</option>
        {(options || []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
