"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * The single source of truth for the storefront filter URL contract.
 *
 *   ?category=loc-gio
 *   &brand=toyota
 *   &model=vios
 *   &year=2020
 *   &q=loc%20dau
 *   &sort=price_asc
 *   &page=2
 *
 * Returned helpers:
 *   - `params`     → current `{category, brand, model, year, q, sort, page}`
 *   - `setParam(key, value)` → push one param; `null`/`""` clears it.
 *   - `setParams(patch)`     → push many; resets page=1 unless you pass `keepPage`.
 *   - `clearAll()`           → wipe every filter, jump back to `?page=1`
 *
 * Why the helpers reset `page`: changing a filter typically reduces
 * the total count, so the user's current page index becomes
 * meaningless. We preserve `page` only when the caller explicitly
 * asks for it (e.g. the "Xem thêm sản phẩm" pagination button).
 *
 * Avoids duplicate fetches: we always call `router.replace` when the
 * resulting query string is identical to the current one. (Next.js
 * already debounces identical-URL navigations, but the explicit
 * compare lets us skip the call entirely and keeps the address bar
 * stable.)
 */
export const SHOP_FILTER_KEYS = ["category", "brand", "model", "year", "q", "sort", "page"];

export function useShopFilterParams({ basePath = "" } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = {};
  for (const k of SHOP_FILTER_KEYS) {
    const v = searchParams.get(k);
    if (v) params[k] = v;
  }

  const buildUrl = useCallback(
    (next) => {
      const usp = new URLSearchParams();
      for (const k of SHOP_FILTER_KEYS) {
        const v = next[k];
        if (v === null || v === undefined || v === "") continue;
        usp.set(k, String(v));
      }
      const qs = usp.toString();
      // Always target the products page — the filter contract only
      // applies there. Sidebar links from /shops/[slug] (home) and
      // /shops/[slug]/san-pham both converge here.
      const path = basePath ? `${basePath}/san-pham` : pathname;
      return qs ? `${path}?${qs}` : path;
    },
    [basePath, pathname],
  );

  const setParam = useCallback(
    (key, value, { replace = false, keepPage = false } = {}) => {
      const next = { ...params };
      if (value === null || value === undefined || value === "") {
        delete next[key];
      } else {
        next[key] = String(value);
      }
      if (!keepPage && key !== "page") delete next.page;
      const url = buildUrl(next);
      const currentUrl = buildUrl(params);
      if (url === currentUrl) return;
      (replace ? router.replace : router.push)(url, { scroll: false });
    },
    [params, router, buildUrl],
  );

  const setParams = useCallback(
    (patch, { replace = false, keepPage = false } = {}) => {
      const next = { ...params, ...patch };
      for (const k of SHOP_FILTER_KEYS) {
        if (next[k] === null || next[k] === undefined || next[k] === "") {
          delete next[k];
        } else {
          next[k] = String(next[k]);
        }
      }
      if (!keepPage) delete next.page;
      const url = buildUrl(next);
      const currentUrl = buildUrl(params);
      if (url === currentUrl) return;
      (replace ? router.replace : router.push)(url, { scroll: false });
    },
    [params, router, buildUrl],
  );

  const clearAll = useCallback(() => {
    const path = basePath ? `${basePath}/san-pham` : pathname;
    router.push(path, { scroll: false });
  }, [basePath, pathname, router]);

  return { params, setParam, setParams, clearAll, buildUrl };
}
