/**
 * SEO-LINKGRAPH-BOOST-PHASE-01/02 — crawlable year-range links for listing pages.
 * Uses existing sitemap inventory only (no new URLs).
 */

import { cache } from "react";
import { API_BASE } from "@/lib/config";
import { slugifyVi } from "@/lib/seo/slugify";
import { buildCategoryOwnerPathFromState } from "@/lib/seo/buildCategoryOwnerPath";
import { buildVehicleOwnerPath } from "@/lib/seo/buildVehicleOwnerPath";
import {
  gateCategoryBrandVehicleYearRangeEntry,
  gateVehicleYearRangeEntry,
} from "@/lib/seo/sitemapGovernance.server";

/** LINKGRAPH-BOOST-PHASE-02 caps (inventory-only links). */
export const LISTING_YEAR_RANGE_LIMITS = Object.freeze({
  cbm: 24,
  bmy: 24,
  rangeSiblings: 24,
});

/**
 * @typedef {{ href: string, label: string }} ListingYearRangeLink
 * @typedef {{ title: string, links: ListingYearRangeLink[] } | null} ListingYearRangeSection
 */

const fetchYearRangeLinksInventory = cache(async function fetchYearRangeLinksInventory() {
  try {
    const res = await fetch(`${API_BASE}/seo/year-range-links`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
});

function categoryCoreFromSlug(canonicalSlug) {
  const cs = String(canonicalSlug || "")
    .trim()
    .toLowerCase();
  if (!cs) return "";
  return cs.endsWith("-o-to") ? cs.slice(0, -"-o-to".length) : cs;
}

function matchSlug(a, b) {
  return slugifyVi(String(a || "")) === slugifyVi(String(b || ""));
}

/**
 * @param {object} row
 * @returns {ListingYearRangeLink | null}
 */
function cbmyRangeLink(row) {
  const slug = String(row?.slug || "").trim();
  if (!slug) return null;
  const label = `${row.yearFrom}–${row.yearTo}`;
  return { href: `/${slug}`, label };
}

/**
 * @param {object} row
 * @returns {ListingYearRangeLink | null}
 */
function bmyRangeLink(row) {
  const slug = String(row?.slug || "").trim();
  if (!slug) return null;
  return { href: `/${slug}`, label: `${row.yearFrom}–${row.yearTo}` };
}

/**
 * @param {object[]} rows
 * @param {{ categorySlug: string, brand: string, model: string, excludeYear?: string }} ctx
 */
function filterCbmyRanges(rows, ctx) {
  const catCore = categoryCoreFromSlug(ctx.categorySlug);
  return (rows || [])
    .filter((row) => {
      if (!gateCategoryBrandVehicleYearRangeEntry({ productCount: row.productCount })) {
        return false;
      }
      if (String(row.categorySlug || "").toLowerCase() !== catCore) return false;
      if (!matchSlug(row.brand, ctx.brand)) return false;
      if (!matchSlug(row.model, ctx.model)) return false;
      const range = `${row.yearFrom}-${row.yearTo}`;
      if (ctx.excludeYear && range === ctx.excludeYear) return false;
      return true;
    })
    .map(cbmyRangeLink)
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));
}

/**
 * @param {object[]} rows
 * @param {{ brand: string, model: string, excludeYear?: string }} ctx
 */
function filterBmyRanges(rows, ctx) {
  return (rows || [])
    .filter((row) => {
      if (!gateVehicleYearRangeEntry({ productCount: row.productCount })) {
        return false;
      }
      if (!matchSlug(row.brand, ctx.brand)) return false;
      if (!matchSlug(row.model, ctx.model)) return false;
      const range = `${row.yearFrom}-${row.yearTo}`;
      if (ctx.excludeYear && range === ctx.excludeYear) return false;
      return true;
    })
    .map(bmyRangeLink)
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));
}

/**
 * @param {{ canonicalName?: string, categoryName?: string, canonicalSlug?: string, cbmBrand?: string, cbmModel?: string }} meta
 * @returns {ListingYearRangeLink | null}
 */
function parentCbmyLink(meta) {
  const href = buildCategoryOwnerPathFromState({
    categoryName: meta.canonicalName || meta.categoryName || "",
    brand: meta.cbmBrand || "",
    model: meta.cbmModel || "",
    year: "",
    canonicalSlug: meta.canonicalSlug || "",
  });
  if (!href || href === "/") return null;
  const brand = String(meta.cbmBrand || "").trim();
  const model = String(meta.cbmModel || "").trim();
  const label = [brand, model].filter(Boolean).join(" ") || "Tất cả đời xe";
  return { href, label: `Tất cả đời xe — ${label}` };
}

/**
 * @param {string} brand
 * @param {string} model
 * @returns {ListingYearRangeLink | null}
 */
function parentBmyLink(brand, model) {
  const href = buildVehicleOwnerPath({ brand, model, year: "" });
  if (!href || href === "/") return null;
  const label = [brand, model].filter(Boolean).join(" ") || "Tất cả đời xe";
  return { href, label: `Tất cả đời xe — ${label}` };
}

/**
 * @param {string} brand
 * @param {string} model
 */
function buildVehicleSiblingTitle(brand, model) {
  const vehicle = [brand, model].filter(Boolean).join(" ");
  return vehicle ? `Các đời ${vehicle} khác` : "Các đời xe khác";
}

/**
 * @param {string} categoryName
 * @param {string} brand
 * @param {string} model
 * @param {boolean} isRangePage
 */
function buildCategorySiblingTitle(categoryName, brand, model, isRangePage) {
  const subject = [categoryName, brand, model].filter(Boolean).join(" ");
  if (!subject) {
    return isRangePage ? "Các đời xe khác" : "Các đời xe phù hợp";
  }
  return isRangePage ? `Các đời ${subject} khác` : `Các đời ${subject} phù hợp`;
}

/**
 * @param {ListingYearRangeLink[]} links
 * @param {ListingYearRangeLink | null} parent
 * @param {number} max
 */
function withOptionalParent(links, parent, max) {
  const list = parent ? [parent, ...links] : links;
  return list.slice(0, parent ? max + 1 : max);
}

/**
 * @param {import('./resolveSeoEntity').SeoEntity} entity
 * @param {string} requestSlug
 * @returns {Promise<ListingYearRangeSection>}
 */
export async function resolveListingYearRangeLinks(entity, requestSlug) {
  const inventory = await fetchYearRangeLinksInventory();
  if (!inventory || !entity) return null;

  if (entity.kind === "category" && entity.categoryMeta?.isCbmy) {
    const meta = entity.categoryMeta;
    const brand = String(meta.cbmBrand || "").trim();
    const model = String(meta.cbmModel || "").trim();
    const year = String(meta.cbmYear || "").trim();
    const categorySlug = meta.canonicalSlug || meta.categorySlug || "";

    if (!brand || !model || meta.cbmLocation) return null;

    const isRangePage = year.includes("-");
    const siblingLinks = filterCbmyRanges(inventory.cbmyRangeListings, {
      categorySlug,
      brand,
      model,
      excludeYear: isRangePage ? year : undefined,
    });

    const parent = isRangePage ? parentCbmyLink(meta) : null;
    const links = withOptionalParent(
      siblingLinks,
      parent,
      isRangePage ? LISTING_YEAR_RANGE_LIMITS.rangeSiblings : LISTING_YEAR_RANGE_LIMITS.cbm,
    );

    if (!links.length) return null;

    const categoryName = String(
      meta.canonicalName || meta.categoryName || "",
    ).trim();

    return {
      title: buildCategorySiblingTitle(
        categoryName,
        brand,
        model,
        isRangePage,
      ),
      links,
    };
  }

  if (entity.kind === "vehicle") {
    const parsed = entity.vehicleSeo?.parsed || {};
    const filters = entity.landing?.filters || {};
    const brand = String(parsed.brand || filters.brand || "").trim();
    const model = String(parsed.model || filters.model || "").trim();
    const year = String(parsed.year || filters.year || "").trim();

    if (!brand || !model || filters.location || parsed.locationName) {
      return null;
    }

    const isRangePage = year.includes("-");
    const siblingLinks = filterBmyRanges(inventory.bmyRangeListings, {
      brand,
      model,
      excludeYear: isRangePage ? year : undefined,
    });

    const parent = isRangePage ? parentBmyLink(brand, model) : null;
    const links = withOptionalParent(
      siblingLinks,
      parent,
      isRangePage ? LISTING_YEAR_RANGE_LIMITS.rangeSiblings : LISTING_YEAR_RANGE_LIMITS.bmy,
    );

    if (!links.length) return null;

    return {
      title: buildVehicleSiblingTitle(brand, model),
      links,
    };
  }

  return null;
}
