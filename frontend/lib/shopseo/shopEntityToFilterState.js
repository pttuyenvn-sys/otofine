/**
 * SHOP-OWNERSHIP-02 — Read adapter: ShopSeoEntity → filter UI dimensions.
 */

import { parseShopSeoPath } from "./parseShopSeoPath.js";
import { shopEntityFiltersToParams } from "./shopIdentityFromPathname.js";
import { shopPathParamsEqual } from "./shopPathParamsShadow.js";

const DIMENSION_KEYS = ["category", "brand", "model", "year"];

/**
 * @typedef {import('./parseShopSeoPath.js').ShopSeoEntity} ShopSeoEntity
 */

/**
 * @param {ShopSeoEntity | null | undefined} entity
 * @returns {{ category?: string, brand?: string, model?: string, year?: string }}
 */
export function shopEntityToFilterState(entity) {
  return shopEntityFiltersToParams(entity);
}

/**
 * Filter UI read path: entity.filters.* first, path-derived fallback (SHOP-OWNERSHIP-05).
 *
 * @param {ShopSeoEntity | null | undefined} entity
 * @param {{ category?: string, brand?: string, model?: string, year?: string }} pathFilters
 * @returns {{ category?: string, brand?: string, model?: string, year?: string }}
 */
export function mergeShopFilterReadState(entity, pathFilters = {}) {
  const fromEntity = shopEntityToFilterState(entity);
  const out = {};

  for (const key of DIMENSION_KEYS) {
    const entityValue = fromEntity[key];
    const pathValue = pathFilters[key];
    if (entityValue != null && entityValue !== "") {
      out[key] = String(entityValue);
    } else if (pathValue != null && pathValue !== "") {
      out[key] = String(pathValue);
    }
  }

  return out;
}

/**
 * @param {ShopSeoEntity | null | undefined} entity
 * @param {{ category?: string, brand?: string, model?: string, year?: string }} pathFilters
 * @param {{ pathname?: string, shopBasePath?: string }} [context]
 */
export function warnShopFilterReadParity(entity, pathFilters = {}, context = {}) {
  if (process.env.NODE_ENV !== "development") return;

  const entityFilters = shopEntityToFilterState(entity);
  if (!entity?.filters) return;

  const pathDims = pickDimensions(pathFilters);
  if (shopPathParamsEqual(entityFilters, pathDims)) return;

  console.warn("[shop-ownership-02] entity vs path read parity mismatch", {
    pathname: context.pathname,
    shopBasePath: context.shopBasePath,
    entity: entityFilters,
    pathFilters: pathDims,
  });
}

function pickDimensions(params) {
  const out = {};
  for (const key of DIMENSION_KEYS) {
    if (params[key]) out[key] = String(params[key]);
  }
  return out;
}

/**
 * Dev-only: after a remove navigation, warn if rebuilt path entity still carries the removed dimension.
 *
 * @param {"category" | "brand" | "model" | "year"} removedKey
 * @param {string} nextSubPath
 * @param {{ categories?: Array<{ slug?: string, name?: string }>, fitments?: object }} [catalog]
 * @param {{ pathname?: string, shopBasePath?: string }} [context]
 */
export function warnShopFilterRemoveParity(
  removedKey,
  nextSubPath,
  catalog = {},
  context = {},
) {
  if (process.env.NODE_ENV !== "development") return;
  if (!removedKey || !nextSubPath) return;

  const entity = parseShopSeoPath(nextSubPath, {
    categories: catalog.categories || [],
    fitments: catalog.fitments || {},
  });
  const rebuilt = shopEntityToFilterState(entity);
  if (!rebuilt[removedKey]) return;

  console.warn("[shop-ownership-04] remove parity: dimension still in rebuilt path entity", {
    removedKey,
    nextSubPath,
    rebuilt,
    pathname: context.pathname,
    shopBasePath: context.shopBasePath,
  });
}

/**
 * Dev-only: legacy ?category|brand|model|year query overlay (SHOP-OWNERSHIP-05).
 *
 * @param {{ get?: (key: string) => string | null }} searchParams
 * @param {{ pathname?: string, shopBasePath?: string }} [context]
 */
export function warnLegacySeoQueryOverlay(searchParams, context = {}) {
  if (process.env.NODE_ENV !== "development") return;

  const overlay = {};
  for (const key of DIMENSION_KEYS) {
    const v = searchParams?.get?.(key);
    if (v) overlay[key] = String(v);
  }
  if (Object.keys(overlay).length === 0) return;

  console.warn("[shop-ownership-05] legacy seo query overlay detected", {
    pathname: context.pathname,
    shopBasePath: context.shopBasePath,
    overlay,
  });
}
