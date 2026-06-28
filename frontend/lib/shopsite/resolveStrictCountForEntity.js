import { fetchPublicShopProductsSafe } from "@/services/shopPublic.service";
import { SHOP_NAMESPACE } from "@/lib/shopseo/namespace.js";
import { mapEntityToProductFilters } from "@/lib/shopseo/mapEntityToProductFilters.js";

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const FILTER_SCAN_PER_PAGE = 60;
const FILTER_SCAN_MAX_PAGES = 80;

/**
 * Canonical count resolver for shop SEO entities.
 *
 * Single source of truth for productCount across grid, metadata, robots, and sitemap.
 *
 * @param {object} input
 * @param {string} input.slug
 * @param {{ namespace?: string, filters?: Record<string, unknown> }} input.entity
 * @param {number} [input.page]
 * @param {number} [input.perPage]
 * @param {string} [input.q]
 * @param {string} [input.sort]
 * @returns {Promise<{ productCount: number, products: Array<Record<string, unknown>>, totalPages: number, page: number, perPage: number }>}
 */
export async function resolveStrictCountForEntity(input) {
  const slug = String(input?.slug || "").trim();
  const entity = input?.entity || {};
  const safePage = Number(input?.page) > 0 ? Number(input.page) : DEFAULT_PAGE;
  const safePerPage = Number(input?.perPage) > 0 ? Number(input.perPage) : DEFAULT_PER_PAGE;
  const sort = input?.sort || "newest";
  const q = input?.q || undefined;
  const entityFilters = mapEntityToProductFilters(entity);
  const query = {
    ...entityFilters,
    q,
    sort,
  };

  if (!needsStrictPostFilter(entity)) {
    const page = await fetchPublicShopProductsSafe(slug, {
      ...query,
      page: safePage,
      perPage: safePerPage,
    });
    return {
      productCount: Number(page?.total) || 0,
      products: Array.isArray(page?.items) ? page.items : [],
      totalPages: Math.max(1, Number(page?.totalPages) || 1),
      page: safePage,
      perPage: safePerPage,
    };
  }

  const predicate = buildEntityProductPredicate(entity);
  const all = await fetchAllProductsForEntity(slug, query);
  const filtered = all.filter(predicate);
  const start = (safePage - 1) * safePerPage;
  const products = filtered.slice(start, start + safePerPage);
  const productCount = filtered.length;
  return {
    productCount,
    products,
    totalPages: Math.max(1, Math.ceil(productCount / safePerPage)),
    page: safePage,
    perPage: safePerPage,
  };
}

/**
 * Fetch all shop products once (for sitemap strict-count alignment).
 *
 * @param {string} slug
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchShopProductCatalog(slug) {
  return fetchAllProductsForEntity(slug, {});
}

/**
 * Count products matching a shop SEO entity predicate (same logic as strict post-filter).
 *
 * @param {{ namespace?: string, filters?: Record<string, unknown> }} entity
 * @param {Array<Record<string, unknown>>} products
 * @returns {number}
 */
export function countProductsForEntity(entity, products) {
  const list = Array.isArray(products) ? products : [];
  return list.filter(buildEntityProductPredicate(entity)).length;
}

async function fetchAllProductsForEntity(slug, baseQuery) {
  const first = await fetchPublicShopProductsSafe(slug, {
    ...baseQuery,
    page: 1,
    perPage: FILTER_SCAN_PER_PAGE,
  });
  const out = Array.isArray(first?.items) ? [...first.items] : [];
  const totalPages = Math.max(1, Number(first?.totalPages) || 1);
  const maxPages = Math.min(totalPages, FILTER_SCAN_MAX_PAGES);
  for (let p = 2; p <= maxPages; p += 1) {
    const page = await fetchPublicShopProductsSafe(slug, {
      ...baseQuery,
      page: p,
      perPage: FILTER_SCAN_PER_PAGE,
    });
    if (Array.isArray(page?.items)) out.push(...page.items);
  }
  return out;
}

function needsStrictPostFilter(entity) {
  if (!entity?.filters) return false;
  const ns = entity.namespace;
  const f = entity.filters;
  const categoryKey = mapEntityToProductFilters(entity).category || "";
  const hasCategoryId = /^c-\d+$/i.test(String(categoryKey));

  if (ns === SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE) return true;
  if (ns === SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE) return true;
  if (f.model && ns === SHOP_NAMESPACE.SHOP_VEHICLE) return true;
  if (f.model && ns === SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE && !hasCategoryId) return true;
  if (f.year && ns === SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE_YEAR) return true;
  return false;
}

function buildEntityProductPredicate(entity) {
  const f = entity?.filters || {};
  const brand = String(f.brand || "").trim().toLowerCase();
  const model = String(f.model || "").trim().toLowerCase();
  const yearToken = String(f.year || "").trim();
  const categoryName = String(f.categoryName || "").trim().toLowerCase();
  let rangeFrom = null;
  let rangeTo = null;
  if (yearToken.includes("-")) {
    const [from, to] = yearToken.split("-");
    rangeFrom = Number(from) || null;
    rangeTo = Number(to) || null;
  } else if (yearToken) {
    const y = Number(yearToken) || null;
    rangeFrom = y;
    rangeTo = y;
  }

  return (item) => {
    if (categoryName) {
      const itemCategory = String(item?.category || "").trim().toLowerCase();
      if (itemCategory !== categoryName) return false;
    }
    if (brand) {
      const itemBrand = String(item?.brand || "").trim().toLowerCase();
      if (itemBrand !== brand) return false;
    }
    if (model) {
      const itemModel = String(item?.model || "").trim().toLowerCase();
      if (itemModel !== model) return false;
    }
    if (rangeFrom != null && rangeTo != null) {
      const itemFrom = Number(item?.yearFrom);
      const itemTo = Number(item?.yearTo);
      if (!Number.isFinite(itemFrom) || !Number.isFinite(itemTo)) return false;
      if (itemTo < rangeFrom || itemFrom > rangeTo) return false;
    }
    return true;
  };
}
