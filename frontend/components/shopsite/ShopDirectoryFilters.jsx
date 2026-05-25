"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShopsiteEvents,
  trackShopsiteEvent,
} from "@/lib/shopsite/shopsiteAnalytics";

/**
 * Phase 7.1 — directory filters island.
 *
 * URL is the source of truth. On every commit (search submit, filter
 * toggle, sort change) we push the resulting query into the router
 * which re-renders the SSR list above with the new params.
 *
 * Why URL state and not local React state:
 *   - shareable links ("send me a link to the verified Hanoi shops")
 *   - browser back/forward history works
 *   - SSR cache key is the URL — filter clicks hit the warm path
 *   - no client-side filtering means the list stays consistent with
 *     the ranking sort even on a huge result set
 *
 * Debounced search (500ms after last keystroke) so typing doesn't
 * trigger a request per character; pressing Enter commits immediately.
 *
 * Analytics: every committed change fires a single shopsite event
 * (DIRECTORY_SEARCH for the search box, DIRECTORY_FILTER for the
 * other facets) so future dashboards can attribute traffic source.
 */
const SORTS = [
  { value: "rank", label: "Đề xuất" },
  { value: "newest", label: "Mới nhất" },
  { value: "name", label: "Tên A-Z" },
];

const TIERS = [
  { value: "", label: "Tất cả" },
  { value: "some", label: "Có sản phẩm" },
  { value: "ten", label: "10+" },
  { value: "fifty", label: "50+" },
  { value: "hundred", label: "100+" },
];

export default function ShopDirectoryFilters({
  provinces = [],
  brands = [],
  total = 0,
}) {
  const router = useRouter();
  const params = useSearchParams();

  const initial = useMemo(
    () => ({
      q: params.get("q") || "",
      brand: params.get("brand") || "",
      province: params.get("province") || params.get("provinceSlug") || "",
      verified: params.get("verified") === "true",
      tier: params.get("tier") || "",
      sort: params.get("sort") || "rank",
    }),
    [params],
  );

  const [search, setSearch] = useState(initial.q);
  const debounceRef = useRef(null);

  // Keep local search in sync if a back-button restores the URL.
  useEffect(() => {
    setSearch(initial.q);
  }, [initial.q]);

  const commit = useCallback(
    (patch) => {
      const next = new URLSearchParams();
      const apply = (key, val) => {
        if (val !== "" && val !== false && val != null) next.set(key, String(val));
      };
      const merged = { ...initial, ...patch, q: patch.q ?? initial.q };
      apply("q", merged.q);
      apply("brand", merged.brand);
      apply("province", merged.province);
      if (merged.verified) apply("verified", "true");
      apply("tier", merged.tier);
      if (merged.sort && merged.sort !== "rank") apply("sort", merged.sort);
      // page resets to 1 on every filter change so we don't land on
      // page 12 of a smaller result set.
      const qs = next.toString();
      router.push(`/shops${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [initial, router],
  );

  const onSearchChange = (e) => {
    const v = e.target.value;
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      trackShopsiteEvent(ShopsiteEvents.DIRECTORY_SEARCH, { q: v, resultCount: total });
      commit({ q: v });
    }, 500);
  };

  const onSearchSubmit = (e) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    trackShopsiteEvent(ShopsiteEvents.DIRECTORY_SEARCH, { q: search, resultCount: total });
    commit({ q: search });
  };

  const onFacet = (facet, value) => {
    trackShopsiteEvent(ShopsiteEvents.DIRECTORY_FILTER, { facet, value });
    commit({ [facet]: value });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-4 space-y-3">
      <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
        <label htmlFor="shops-search" className="sr-only">
          Tìm shop
        </label>
        <div className="relative flex-1">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            id="shops-search"
            type="search"
            value={search}
            onChange={onSearchChange}
            placeholder="Tìm shop theo tên, mô tả, hãng xe…"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#e60012] outline-none pl-9 pr-3 py-2 text-sm placeholder:text-gray-400"
            aria-label="Tìm shop"
          />
        </div>
        <button
          type="submit"
          className="hidden sm:inline-flex items-center bg-[#e60012] hover:bg-[#c1000f] text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          Tìm
        </button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <select
          value={initial.brand}
          onChange={(e) => onFacet("brand", e.target.value)}
          aria-label="Lọc theo hãng xe"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Tất cả hãng xe</option>
          {brands.map((b) => (
            <option key={b.brand} value={b.brand}>
              {b.brand} ({b.shopCount})
            </option>
          ))}
        </select>

        <select
          value={initial.province}
          onChange={(e) => onFacet("province", e.target.value)}
          aria-label="Lọc theo tỉnh/thành"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Tất cả tỉnh/thành</option>
          {provinces.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name} ({p.shopCount})
            </option>
          ))}
        </select>

        <select
          value={initial.tier}
          onChange={(e) => onFacet("tier", e.target.value)}
          aria-label="Lọc theo số lượng sản phẩm"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          value={initial.sort}
          onChange={(e) => onFacet("sort", e.target.value)}
          aria-label="Sắp xếp"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sắp xếp: {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={initial.verified}
            onChange={(e) => onFacet("verified", e.target.checked)}
            className="rounded border-gray-300 text-[#e60012] focus:ring-[#e60012]"
          />
          Chỉ shop đã xác minh
        </label>
        <span className="text-xs text-gray-500 tabular-nums">
          {Number(total).toLocaleString("vi-VN")} shop
        </span>
      </div>
    </div>
  );
}
