import { cache } from "react";

import { fetchProductCategoryRows } from "@/lib/seo/fetchProductCategoryCatalog.server";
import { categoryLandingSlugFromName } from "@/lib/seo/slugify";
import {
  buildPageTitle,
} from "@/components/pages/home/services/listingSeoState";
import listingUrlHelpers from "@/components/pages/home/services/listingUrlState";

const { buildListingUrlFromIdentity } = listingUrlHelpers;

/**
 * @typedef {{
 *   canonicalSlug: string,
 *   canonicalName: string,
 *   categoryName: string,
 *   categorySlug: string,
 *   isAlias: boolean,
 *   isCbmy: boolean,
 *   isPartVehicle: boolean,
 * }} CategorySlugMeta
 */

/**
 * Cached category catalog + slug → canonical lookup.
 */
export const fetchCategoryCatalog = cache(async function fetchCategoryCatalog() {
  const rows = await fetchProductCategoryRows();
  /** @type {Map<string, CategorySlugMeta>} */
  const slugToMeta = new Map();
  /** @type {Set<string>} */
  const authoritySlugs = new Set();
  /** @type {Set<string>} */
  const canonicalSlugs = new Set();

  for (const raw of rows) {
    const canonicalSlug = String(raw?.canonical_slug || "")
      .trim()
      .toLowerCase();
    if (!canonicalSlug) continue;

    const categorySlug = String(raw?.category_slug || canonicalSlug)
      .trim()
      .toLowerCase();
    const canonicalName = String(
      raw?.canonical_name || raw?.category_name || "",
    ).trim();
    const categoryName = String(raw?.category_name || canonicalName).trim();
    const nameSlug = categoryLandingSlugFromName(categoryName);

    const meta = {
      canonicalSlug,
      canonicalName,
      categoryName,
      categorySlug,
      isAlias: false,
      isCbmy: false,
      isPartVehicle: false,
    };

    canonicalSlugs.add(canonicalSlug);

    const register = (slug, isAlias) => {
      const key = String(slug || "").trim().toLowerCase();
      if (!key) return;
      authoritySlugs.add(key);
      if (!slugToMeta.has(key)) {
        slugToMeta.set(key, { ...meta, isAlias });
      }
    };

    register(canonicalSlug, false);
    if (categorySlug !== canonicalSlug) {
      register(categorySlug, true);
    }
    if (nameSlug && nameSlug !== canonicalSlug) {
      register(nameSlug, true);
    }
  }

  return { rows, slugToMeta, authoritySlugs, canonicalSlugs };
});

/**
 * @param {{
 *  categoryName?: string,
 *  brand?: string,
 *  model?: string,
 *  year?: string|number|null,
 *  location?: string,
 *  canonicalSlug?: string,
 * }} state
 * @returns {string}
 */
export function buildCategoryOwnerPathFromState(state = {}) {
  const categoryName = String(state.categoryName || "").trim();
  const canonicalSlug = String(state.canonicalSlug || "").trim().toLowerCase();
  return buildListingUrlFromIdentity({
    categoryName,
    hasCategory: Boolean(categoryName),
    brand: String(state.brand || "").trim(),
    model: String(state.model || "").trim(),
    year: String(state.year || "").trim(),
    location: String(state.location || "").trim(),
    canonicalSlug,
  });
}

/**
 * Legacy-compatible wrapper.
 *
 * @param {string} canonicalSlug
 * @param {string} categoryName
 * @returns {string | null}
 */
export function buildCategoryOwnerPath(canonicalSlug, categoryName = "") {
  const s = String(canonicalSlug || "").trim().toLowerCase();
  if (s) return `/${s}`;
  if (String(categoryName || "").trim()) {
    return buildCategoryOwnerPathFromState({ categoryName });
  }
  return null;
}

/**
 * @param {string} slug
 * @returns {Promise<CategorySlugMeta | null>}
 */
export async function lookupCategoryByRequestSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;

  const { slugToMeta } = await fetchCategoryCatalog();
  const hit = slugToMeta.get(s);
  return hit ? { ...hit } : null;
}

/**
 * Slug belongs to category authority set (canonical, alias, or name slug).
 * Used to prefer category over knowledge in resolveSeoEntity.
 *
 * @param {string} slug
 */
export async function isCategoryAuthoritySlug(slug) {
  const { authoritySlugs } = await fetchCategoryCatalog();
  return authoritySlugs.has(String(slug || "").trim().toLowerCase());
}

/**
 * @param {{ categoryMeta?: CategorySlugMeta | null, landing?: { h1?: string } | null }} entity
 * @param {string} requestSlug
 * @returns {string | null}
 */
export function resolveCategoryOwnerPath(entity, _requestSlug) {
  const meta = entity?.categoryMeta;
  if (!meta || meta.isPartVehicle) return null;

  const landingFilters = entity?.landing?.filters || {};
  const categoryName = meta.canonicalName || meta.categoryName || "";
  const brand = meta.cbmBrand || "";
  const model = meta.cbmModel || "";
  const year = meta.cbmYear || "";
  const location = meta.cbmLocation || landingFilters.location || "";
  return buildCategoryOwnerPathFromState({
    categoryName,
    brand,
    model,
    year,
    location,
    canonicalSlug: meta.canonicalSlug || "",
  });
}

/**
 * @param {CategorySlugMeta} meta
 */
export function categoryLandingFromMeta(meta) {
  const name = meta.canonicalName || meta.categoryName;
  const h1 = buildPageTitle({
    categoryName: name || "",
    hasCategory: Boolean(name),
    brand: "",
    model: "",
    year: "",
    location: "",
  });
  const href =
    buildCategoryOwnerPathFromState({
      categoryName: name || "",
      canonicalSlug: meta.canonicalSlug || "",
    }) || "/";
  return {
    kind: "category",
    filters: { category: meta.canonicalName || meta.categoryName },
    h1,
    breadcrumb: [
      { name: "Trang chủ", href: "/" },
      { name: "Phụ tùng ô tô", href: "/phu-tung-o-to" },
      { name: h1, href },
    ],
  };
}
