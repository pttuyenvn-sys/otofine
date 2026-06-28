import { cache } from "react";

import { API_BASE } from "@/lib/config";
import { isIndexable, NAMESPACE } from "@/lib/seo/urlGovernance";

const LIST_PAGE_SIZE = 16;

function appendListingParam(params, key, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return;
  params.set(key, raw);
}

function normalizeLocationName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (/^TP Hồ Chí Minh$/i.test(raw)) return "TP Hồ Chí Minh";
  if (/^TP\s+/i.test(raw)) return raw.replace(/^TP\s+/i, "").trim();
  return raw;
}

function normalizeCategoryKey(name) {
  return String(name || "")
    .trim()
    .toLocaleLowerCase("vi-VN");
}

function parseYearFromRequestSlug(requestSlug = "") {
  const beforeLoc = String(requestSlug || "").trim().toLowerCase().split("-tai-")[0];
  const rangeMatch = beforeLoc.match(/((?:19|20)\d{2})-((?:19|20)\d{2})$/);
  if (rangeMatch) {
    return `${rangeMatch[1]}-${rangeMatch[2]}`;
  }
  const singleMatch = beforeLoc.match(/((?:19|20)\d{2})$/);
  return singleMatch ? singleMatch[1] : "";
}

async function fetchJson(path) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) return null;
  return res.json();
}

const loadAvailableLocations = cache(async function loadAvailableLocations() {
  const rows = await fetchJson("/locations/available");
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    name: normalizeLocationName(row.name),
    productCount: Number(row.productCount) || 0,
    sellerCount: Number(row.shopCount) || 0,
  }));
});

async function fetchListPage(params, page) {
  const q = new URLSearchParams(params);
  q.set("page", String(page));
  const payload = await fetchJson(`/products?${q.toString()}`);
  if (!payload || typeof payload !== "object") {
    return { data: [], totalPages: 0 };
  }
  const total = Number(payload.total);
  const totalPages =
    Number(payload.totalPages) ||
    (Number.isFinite(total) && total > 0
      ? Math.ceil(total / LIST_PAGE_SIZE)
      : 0);
  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    totalPages,
    total: Number.isFinite(total) ? total : undefined,
  };
}

async function fetchProductCountViaList(filters) {
  const params = new URLSearchParams();
  appendListingParam(params, "category", filters.category);
  appendListingParam(params, "brand", filters.brand);
  appendListingParam(params, "model", filters.model);
  appendListingParam(params, "year", filters.year);
  appendListingParam(params, "location", filters.location);

  const first = await fetchListPage(params, 1);
  if (Number.isFinite(first.total) && first.total >= 0) {
    return first.total;
  }
  const totalPages = first.totalPages;
  if (totalPages <= 0) return 0;
  if (totalPages === 1) return first.data.length;
  const last = await fetchListPage(params, totalPages);
  return (totalPages - 1) * LIST_PAGE_SIZE + last.data.length;
}

async function fetchCategoryScopedProductCount(filters) {
  const category = String(filters.category || "").trim();
  if (!category) return null;

  const params = new URLSearchParams();
  appendListingParam(params, "brand", filters.brand);
  appendListingParam(params, "model", filters.model);
  appendListingParam(params, "year", filters.year);
  appendListingParam(params, "location", filters.location);

  const rows = await fetchJson(`/product-categories?${params.toString()}`);
  if (!Array.isArray(rows)) return 0;

  const target = normalizeCategoryKey(category);
  const hit = rows.find((row) => {
    const canonical = normalizeCategoryKey(row?.canonical_name);
    const label = normalizeCategoryKey(row?.category_name);
    return canonical === target || label === target;
  });

  return hit ? Number(hit.product_count) || 0 : 0;
}

/**
 * @param {{ kind?: string, vehicleSeo?: object | null, landing?: object | null, categoryMeta?: object | null, requestSlug?: string }} entity
 * @param {string} slug
 * @returns {string | null}
 */
export function resolveListingGovernanceNamespace(entity, slug) {
  const requestSlug = String(slug || entity?.requestSlug || "")
    .trim()
    .toLowerCase();
  const hasLoc = requestSlug.includes("-tai-");

  if (entity?.kind === "vehicle") {
    const parsed = entity.vehicleSeo?.parsed || {};
    const filters = entity.landing?.filters || {};
    const brand = String(parsed.brand || filters.brand || "").trim();
    const model = String(parsed.model || filters.model || "").trim();
    const year = String(parsed.year ?? filters.year ?? "").trim();
    const location = String(parsed.locationName || filters.location || "").trim();

    if (location && !brand && !model && !year) return NAMESPACE.LOCATION;
    if (location && (brand || model)) return NAMESPACE.VEHICLE_LOCATION;
    if (year.includes("-")) return NAMESPACE.VEHICLE_YEAR_RANGE;
    if (year) return NAMESPACE.VEHICLE_YEAR;
    return NAMESPACE.VEHICLE;
  }

  if (entity?.kind === "category") {
    const meta = entity.categoryMeta || {};
    const filters = entity.landing?.filters || {};
    const categoryName = String(
      meta.canonicalName || meta.categoryName || filters.category || "",
    ).trim();
    const brand = String(meta.cbmBrand || filters.brand || "").trim();
    const model = String(meta.cbmModel || filters.model || "").trim();
    const year = String(meta.cbmYear ?? filters.year ?? "").trim();
    const location = String(meta.cbmLocation || filters.location || "").trim();
    const slugYear = parseYearFromRequestSlug(requestSlug);
    const resolvedYear = year.includes("-") ? year : slugYear || year;

    if (categoryName && brand && model) {
      if (resolvedYear.includes("-") && (location || hasLoc)) {
        return NAMESPACE.CATEGORY_BRAND_VEHICLE_YEAR_RANGE_LOCATION;
      }
      if (resolvedYear.includes("-")) {
        return NAMESPACE.CATEGORY_BRAND_VEHICLE_YEAR_RANGE;
      }
      if (location || hasLoc) {
        return NAMESPACE.CATEGORY_BRAND_VEHICLE_LOCATION;
      }
      return resolvedYear ? NAMESPACE.CBMY : NAMESPACE.CBM;
    }
    if (categoryName && (location || hasLoc)) {
      return NAMESPACE.CATEGORY_LOCATION;
    }
    if (categoryName) return NAMESPACE.CATEGORY;
  }

  return null;
}

/**
 * @param {{ kind?: string, vehicleSeo?: object | null, landing?: object | null, categoryMeta?: object | null }} entity
 * @returns {{ category: string, brand: string, model: string, year: string, location: string } | null}
 */
export function extractListingGovernanceFilters(entity) {
  if (entity?.kind === "vehicle") {
    const parsed = entity.vehicleSeo?.parsed || {};
    const filters = entity.landing?.filters || {};
    return {
      category: "",
      brand: String(parsed.brand || filters.brand || "").trim(),
      model: String(parsed.model || filters.model || "").trim(),
      year: String(parsed.year ?? filters.year ?? "").trim(),
      location: normalizeLocationName(parsed.locationName || filters.location || ""),
    };
  }

  if (entity?.kind === "category") {
    const meta = entity.categoryMeta || {};
    const filters = entity.landing?.filters || {};
    const requestSlug = String(entity?.requestSlug || "").trim().toLowerCase();
    const metaYear = String(meta.cbmYear ?? filters.year ?? "").trim();
    const slugYear = parseYearFromRequestSlug(requestSlug);
    const year = metaYear.includes("-") ? metaYear : slugYear || metaYear;
    return {
      category: String(
        meta.canonicalName || meta.categoryName || filters.category || "",
      ).trim(),
      brand: String(meta.cbmBrand || filters.brand || "").trim(),
      model: String(meta.cbmModel || filters.model || "").trim(),
      year,
      location: normalizeLocationName(meta.cbmLocation || filters.location || ""),
    };
  }

  return null;
}

/**
 * @param {{ kind?: string, vehicleSeo?: object | null, landing?: object | null, categoryMeta?: object | null, requestSlug?: string }} entity
 * @param {string} slug
 * @returns {Promise<{ productCount: number, sellerCount: number }>}
 */
export async function resolveListingGovernanceMetrics(entity, slug) {
  const namespace = resolveListingGovernanceNamespace(entity, slug);
  const filters = extractListingGovernanceFilters(entity);
  if (!namespace || !filters) {
    return { productCount: 0, sellerCount: 0 };
  }

  let productCount = 0;
  const categoryScoped = filters.category
    ? await fetchCategoryScopedProductCount(filters)
    : null;
  if (categoryScoped != null && categoryScoped > 0) {
    productCount = categoryScoped;
  } else if (
    entity?.kind === "vehicle" &&
    !filters.year &&
    Number(entity?.vehicleSeo?.productStats?.total_products) > 0
  ) {
    productCount = Number(entity.vehicleSeo.productStats.total_products) || 0;
  } else {
    productCount = await fetchProductCountViaList(filters);
  }

  let sellerCount = 0;
  if (
    namespace === NAMESPACE.LOCATION ||
    namespace === NAMESPACE.VEHICLE_LOCATION ||
    namespace === NAMESPACE.CATEGORY_LOCATION
  ) {
    const locations = await loadAvailableLocations();
    const target = normalizeLocationName(filters.location);
    if (target) {
      const hit = locations.find(
        (row) => normalizeLocationName(row.name) === target,
      );
      if (hit) {
        sellerCount = hit.sellerCount;
        if (
          namespace === NAMESPACE.LOCATION &&
          productCount === 0 &&
          hit.productCount > 0
        ) {
          productCount = hit.productCount;
        }
      }
    }
  }

  return { productCount, sellerCount };
}

/**
 * Listing routes only — robots metadata from urlGovernance.isIndexable().
 *
 * @param {{ kind?: string, vehicleSeo?: object | null, landing?: object | null, categoryMeta?: object | null, requestSlug?: string }} entity
 * @param {string} slug
 * @returns {Promise<{ robots: { index: boolean, follow: boolean } }>}
 */
export async function buildListingRobotsMetadata(entity, slug) {
  const namespace = resolveListingGovernanceNamespace(entity, slug);
  if (!namespace) {
    return { robots: { index: true, follow: true } };
  }

  const metrics = await resolveListingGovernanceMetrics(entity, slug);
  const index = isIndexable(namespace, metrics);
  return {
    robots: {
      index,
      follow: true,
    },
  };
}
