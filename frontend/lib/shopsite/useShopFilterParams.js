"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SHOP_COLLECTION_PATH } from "@/lib/shopseo/namespace.js";
import { buildShopSeoFilterNavigatePath } from "@/lib/shopseo/buildShopSeoFilterNavigatePath.js";
import { legacyInferSeoParams } from "@/lib/shopseo/legacyInferSeoParams.js";
import {
  normalizeCatalogCategories,
  shopParamsFromPathname,
} from "@/lib/shopseo/shopIdentityFromPathname.js";
import {
  mergeShopFilterReadState,
  warnShopFilterReadParity,
  warnShopFilterRemoveParity,
  warnLegacySeoQueryOverlay,
} from "@/lib/shopseo/shopEntityToFilterState.js";
import { SHOP_SEO_FILTER_DIMENSIONS } from "@/lib/shopseo/shopSeoFilterRemovePatch.js";
import { warnShopPathParamsShadow } from "@/lib/shopseo/shopPathParamsShadow.js";

/**
 * Storefront filter URL contract (SHOP-OWNERSHIP-05).
 *
 * SEO dimensions (category, brand, model, year) → PATH only via parseShopSeoPath.
 * Transient query keys → ?q= &sort= &page=
 *
 * Returned helpers:
 *   - `params`      → `{ q, sort, page }` query state only
 *   - `readFilters` → entity.filters.* with path-derived fallback
 *   - `setParam`    → query writer for `q`, `sort`, `page`
 *   - `navigateSeoFilters` → PATH writer for SEO dimensions
 */
export const SHOP_FILTER_KEYS = ["category", "brand", "model", "year", "q", "sort", "page"];
export const SHOP_QUERY_FILTER_KEYS = ["q", "sort", "page"];
const SHOP_SEO_DIM_SET = new Set(SHOP_SEO_FILTER_DIMENSIONS);

export function useShopFilterParams({
  basePath = "",
  shopBasePath,
  shopSlug = "",
  fitments = null,
  categories = null,
  entity = null,
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const resolvedShopBase = resolveShopBasePath({ basePath, shopBasePath });
  const catalog = {
    categories: normalizeCatalogCategories(categories),
    fitments: fitments || {},
  };

  const pathFilters = shopParamsFromPathname(pathname, {
    shopBasePath: resolvedShopBase,
    catalog,
  });

  if (process.env.NODE_ENV === "development") {
    const legacyParams = legacyInferSeoParams(pathname, fitments);
    warnShopPathParamsShadow(legacyParams, pathFilters, {
      pathname,
      shopBasePath: resolvedShopBase,
    });
    warnLegacySeoQueryOverlay(searchParams, {
      pathname,
      shopBasePath: resolvedShopBase,
    });
  }

  const params = {};
  for (const k of SHOP_QUERY_FILTER_KEYS) {
    const v = searchParams.get(k);
    if (v) params[k] = v;
  }

  const readFilters = mergeShopFilterReadState(entity, pathFilters);

  if (process.env.NODE_ENV === "development") {
    warnShopFilterReadParity(entity, pathFilters, {
      pathname,
      shopBasePath: resolvedShopBase,
    });
  }

  const scopedCollectionPath = buildScopedPath(
    resolvedShopBase,
    SHOP_COLLECTION_PATH,
  );

  const buildUrl = useCallback(
    (next) => {
      const usp = new URLSearchParams();
      for (const k of SHOP_QUERY_FILTER_KEYS) {
        const v = next[k];
        if (v === null || v === undefined || v === "") continue;
        usp.set(k, String(v));
      }
      const qs = usp.toString();
      const path = pathname ? pathname.split("?")[0] : scopedCollectionPath;
      return qs ? `${path}?${qs}` : path;
    },
    [pathname, scopedCollectionPath],
  );

  const setParam = useCallback(
    (key, value, { replace = false, keepPage = false } = {}) => {
      if (SHOP_SEO_DIM_SET.has(key)) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[shop-ownership-04] setParam blocked for SEO dimension; use navigateSeoFilters",
            { key },
          );
        }
        return;
      }
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
      const next = { ...params };
      for (const [key, value] of Object.entries(patch || {})) {
        if (SHOP_SEO_DIM_SET.has(key)) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[shop-ownership-04] setParams blocked for SEO dimension; use navigateSeoFilters",
              { key },
            );
          }
          continue;
        }
        if (value === null || value === undefined || value === "") {
          delete next[key];
        } else {
          next[key] = String(value);
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

  const navigateSeoFilters = useCallback(
    async (
      input = {},
      { replace = false } = {},
    ) => {
      const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
      const explicitClearAll = Object.keys(input || {}).length === 0;
      const scopedBase = resolveShopBasePath({ basePath, shopBasePath });
      const currentUrl = (() => {
        const currentQs = buildPersistentQuery(params, { keepPage: false });
        return currentQs ? `${pathname}?${currentQs}` : pathname;
      })();

      if (explicitClearAll) {
        const target = buildScopedPath(scopedBase, SHOP_COLLECTION_PATH);
        if (target === currentUrl) return;
        (replace ? router.replace : router.push)(target, { scroll: false });
        return;
      }

      const category = has("category")
        ? normalizeSeoDim(input.category)
        : normalizeSeoDim(readFilters.category);
      const brand = has("brand")
        ? normalizeSeoDim(input.brand)
        : normalizeSeoDim(readFilters.brand);
      const model = has("model")
        ? normalizeSeoDim(input.model)
        : normalizeSeoDim(readFilters.model);
      const year = has("year")
        ? normalizeSeoDim(input.year)
        : normalizeSeoDim(readFilters.year);

      const removedKeys = SHOP_SEO_FILTER_DIMENSIONS.filter(
        (key) => has(key) && normalizeSeoDim(input[key]) == null,
      );

      const nextPath = await buildShopSeoFilterNavigatePath(
        { category, brand, model, year, shopSlug },
        { resolveYearRange: resolveVehicleYearRange },
      );

      if (process.env.NODE_ENV === "development") {
        for (const removedKey of removedKeys) {
          warnShopFilterRemoveParity(removedKey, nextPath, catalog, {
            pathname,
            shopBasePath: resolvedShopBase,
          });
        }
      }

      const qs = buildPersistentQuery(params, { keepPage: false });
      const target = buildScopedPath(scopedBase, nextPath);
      const url = qs ? `${target}?${qs}` : target;
      if (url === currentUrl) return;
      (replace ? router.replace : router.push)(url, { scroll: false });
    },
    [basePath, pathname, shopBasePath, shopSlug, params, readFilters, router, catalog, resolvedShopBase],
  );

  const clearAll = useCallback(() => {
    router.push(scopedCollectionPath, { scroll: false });
  }, [router, scopedCollectionPath]);

  return {
    params,
    readFilters,
    setParam,
    setParams,
    clearAll,
    buildUrl,
    navigateSeoFilters,
  };
}

function resolveShopBasePath({ basePath = "", shopBasePath = "" }) {
  const hasExplicitShopBase =
    shopBasePath !== undefined && shopBasePath !== null;
  const source = hasExplicitShopBase ? shopBasePath : basePath;
  const raw = String(source || "").trim();
  if (!raw) return "";
  return raw.endsWith(SHOP_COLLECTION_PATH)
    ? raw.slice(0, -SHOP_COLLECTION_PATH.length)
    : raw;
}

function buildScopedPath(base, subPath) {
  const b = String(base || "").replace(/\/+$/, "");
  const s = String(subPath || "").startsWith("/")
    ? String(subPath || "")
    : `/${String(subPath || "")}`;
  return b ? `${b}${s}` : s;
}

function buildPersistentQuery(params, { keepPage = false } = {}) {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", String(params.q));
  if (params.sort) usp.set("sort", String(params.sort));
  if (keepPage && params.page) usp.set("page", String(params.page));
  return usp.toString();
}

function normalizeYearValue(year) {
  const n = Number(year);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeSeoDim(value) {
  if (value == null || value === "") return null;
  return String(value);
}

async function resolveVehicleYearRange({ shopSlug, brand, model, year }) {
  if (!shopSlug || !brand || !model || !year) return null;

  const endpoints = [
    `/api/public/shops/${encodeURIComponent(shopSlug)}/products`,
    `https://otofine.com/api/public/shops/${encodeURIComponent(shopSlug)}/products`,
  ];
  const query = new URLSearchParams({
    brand: String(brand),
    model: String(model),
    page: "1",
    perPage: "100",
  });

  let page = null;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${endpoint}?${query}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      page = await res.json();
      break;
    } catch {
      // Try next endpoint fallback.
    }
  }
  if (!page) return null;

  const selectedYear = Number(year);
  const agg = new Map();
  for (const item of Array.isArray(page.items) ? page.items : []) {
    const yearFrom = Number(item?.yearFrom);
    const yearTo = Number(item?.yearTo);
    if (!Number.isFinite(yearFrom) || !Number.isFinite(yearTo)) continue;
    if (yearFrom <= 0 || yearTo <= 0 || yearFrom === yearTo) continue;
    if (selectedYear < yearFrom || selectedYear > yearTo) continue;
    const key = `${yearFrom}-${yearTo}`;
    const cur = agg.get(key) || { yearFrom, yearTo, count: 0 };
    cur.count += 1;
    agg.set(key, cur);
  }

  const candidates = Array.from(agg.values()).sort((a, b) => {
    const byCount = b.count - a.count;
    if (byCount !== 0) return byCount;
    const spanA = a.yearTo - a.yearFrom;
    const spanB = b.yearTo - b.yearFrom;
    if (spanA !== spanB) return spanA - spanB;
    return a.yearFrom - b.yearFrom;
  });

  if (candidates.length === 0) return null;
  return candidates[0];
}
