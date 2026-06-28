"use client";

import { useEffect, useRef, useState } from "react";
import { useShopFilterParams } from "@/lib/shopsite/useShopFilterParams";

/**
 * Mobile-only category selector.
 *
 *   <ShopMobileCategories categories={…} basePath={…} />
 *
 * Renders nothing on `sm:` and up — the desktop sidebar (existing
 * <ShopSidebar />) keeps the category list always-visible at the
 * side. On phones the sidebar was previously stacked BELOW (or in
 * the san-pham case, ABOVE) the product grid, forcing the user to
 * scroll past the whole list before reaching products. This
 * component replaces that with:
 *
 *   1. a chip-style "Danh mục" button that always shows the
 *      currently-active category name (so the user knows their
 *      filter state at a glance), and
 *   2. a bottom-sheet drawer that slides up on tap, lists every
 *      category, and dismisses on selection / overlay tap / ESC.
 *
 * Performance:
 *   - The drawer markup is mounted only when `open === true`.
 *     Until first open, only the trigger button exists in the DOM.
 *   - No portal — the drawer uses `fixed inset-0` so it floats
 *     above page content without restructuring the layout tree
 *     (avoids layout shift on toggle).
 *   - Scroll-lock on `<body>` while open so the drawer doesn't
 *     scroll the underlying page.
 *
 * SSR: the trigger button renders identically server-side (no
 * conditional based on `open`), so there's no hydration mismatch.
 */
export default function ShopMobileCategories({
  categories = [],
  basePath = "",
  shopBasePath = "",
  shopSlug = "",
  fitments = null,
  entity = null,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const { readFilters, navigateSeoFilters, clearAll } = useShopFilterParams({
    basePath,
    shopBasePath,
    shopSlug,
    categories,
    fitments,
    entity,
  });
  const activeSlug = readFilters.category || "";
  const activeCat = categories.find((c) => c.slug === activeSlug);

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

  const handlePick = (slug) => {
    void navigateSeoFilters({ category: slug || null });
    setOpen(false);
  };

  const label = activeCat ? activeCat.name : "Tất cả danh mục";

  return (
    <div className={`lg:hidden ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-between gap-2 bg-white rounded-xl shadow-sm ring-1 ring-gray-100 px-3 py-2.5 text-sm font-medium text-gray-800 active:scale-[0.99] transition-transform"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <FolderIcon />
          <span className="truncate">
            <span className="text-gray-500 font-normal">Danh mục: </span>
            {label}
          </span>
        </span>
        <ChevronIcon />
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Chọn danh mục"
          className="fixed inset-0 z-50 flex flex-col justify-end"
        >
          {/* Scrim */}
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[1px] animate-[fade-in_180ms_ease-out]"
          />

          {/* Sheet */}
          <div
            className="relative bg-white rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.18)] max-h-[80vh] flex flex-col animate-[slide-up_220ms_cubic-bezier(0.2,0.7,0.2,1)]"
            style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
          >
            <div className="pt-2 pb-1 flex justify-center">
              <span aria-hidden className="block w-9 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-center justify-between px-4 pb-2 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">
                Danh mục sản phẩm
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

            <ul className="overflow-y-auto divide-y divide-gray-100 flex-1">
              <li>
                <button
                  type="button"
                  onClick={() => handlePick("")}
                  className={`w-full text-left flex items-center justify-between px-4 py-3 text-sm ${
                    !activeSlug
                      ? "bg-red-50 text-[#e60012] font-medium"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span>Tất cả sản phẩm</span>
                  {!activeSlug && <CheckIcon />}
                </button>
              </li>
              {categories.map((cat) => {
                const active = cat.slug === activeSlug;
                return (
                  <li key={cat.id ?? cat.slug}>
                    <button
                      type="button"
                      onClick={() => handlePick(cat.slug)}
                      className={`w-full text-left flex items-center justify-between px-4 py-3 text-sm ${
                        active
                          ? "bg-red-50 text-[#e60012] font-medium"
                          : "text-gray-800 hover:bg-gray-50"
                      }`}
                    >
                      <span className="truncate">{cat.name}</span>
                      {active && <CheckIcon />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  clearAll();
                  setOpen(false);
                }}
                className="text-sm text-[#e60012] font-medium hover:underline"
              >
                Xóa bộ lọc
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm bg-[#e60012] text-white px-4 py-2 rounded-xl font-medium"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minimal animation keyframes scoped via a global rule. We
          inject them once via a single <style> tag (no jsx-styled
          dependency). */}
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

function FolderIcon() {
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
      className="text-[#e60012] shrink-0"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-gray-400 shrink-0"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-[#e60012]"
    >
      <polyline points="20 6 9 17 4 12" />
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
