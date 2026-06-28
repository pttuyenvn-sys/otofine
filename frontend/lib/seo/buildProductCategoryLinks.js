import { buildCategoryOwnerPathFromState } from "./buildCategoryOwnerPath.js";
import { buildPageTitle } from "@/components/pages/home/services/listingSeoState";

/**
 * @typedef {{ href: string, label: string, categoryName: string }} ProductCategoryLink
 */

/**
 * Read canonical category fields from product detail payload rows.
 *
 * @param {Record<string, unknown> | null | undefined} row
 */
export function readCategoryFields(row) {
  if (!row || typeof row !== "object") {
    return { categoryName: "", canonicalSlug: "" };
  }
  const categoryName = String(
    row.canonicalName ??
      row.canonical_name ??
      row.categoryName ??
      row.category_name ??
      "",
  ).trim();
  const canonicalSlug = String(
    row.canonical_slug ?? row.category_slug ?? row.slug ?? "",
  )
    .trim()
    .toLowerCase();
  return { categoryName, canonicalSlug };
}

/**
 * Build crawlable category listing links from existing product category rows.
 * Uses canonical category URL owner only — no new slug logic.
 *
 * @param {unknown[] | null | undefined} categories
 * @returns {ProductCategoryLink[]}
 */
export function buildProductCategoryLinks(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return [];

  /** @type {Map<string, ProductCategoryLink>} */
  const byHref = new Map();

  for (const row of categories) {
    const { categoryName, canonicalSlug } = readCategoryFields(row);
    if (!categoryName) continue;

    const href = buildCategoryOwnerPathFromState({ categoryName, canonicalSlug });
    const label = buildPageTitle({
      categoryName,
      hasCategory: true,
    });

    if (!href || href === "/" || !label || byHref.has(href)) continue;

    byHref.set(href, { href, label, categoryName });
  }

  return [...byHref.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "vi"),
  );
}

/**
 * @param {ProductCategoryLink[]} links
 */
export function summarizeProductCategoryLinks(links) {
  const list = Array.isArray(links) ? links : [];
  return {
    categoryLinks: list.length,
    uniqueUrls: new Set(list.map((x) => x.href)).size,
  };
}
