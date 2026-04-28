import { slugifyVi } from "./slugify";

/**
 * Deterministic storefront context when `loadPartSeoPage` succeeds — one entity for shell + list + article.
 * @param {Record<string, unknown> | null | undefined} partEngine API payload (`GET /api/seo-page/:slug`).
 * @param {string} slug URL segment (lowercase)
 * @returns {null | {
 *   slug: string,
 *   h1: string,
 *   categoryName: string,
 *   categorySlug: string,
 *   partKnowledgeId: string | number
 * }}
 */
export function buildSeoListingContext(partEngine, slug) {
  if (!partEngine?.part) return null;

  const part = partEngine.part;
  const route = partEngine.route || {};

  const h1Raw =
    (typeof route?.h1 === "string" && route.h1.trim()) ||
    (typeof part?.name_vi === "string" && String(part.name_vi).trim()) ||
    String(slug || "").trim();

  const cn =
    (part?.category_name != null &&
      String(part.category_name).trim()) ||
    (part?.category_tag != null && String(part.category_tag).trim()) ||
    "";

  const catSlugFull = cn ? slugifyVi(`${cn} ô tô`) : "";

  let pid =
    part?.id ?? part?.Id ?? route?.part_knowledge_id ?? route?.partKnowledgeId;

  return {
    slug: String(slug || "")
      .toLowerCase()
      .trim(),
    h1: h1Raw,
    categoryName: cn,
    categorySlug: catSlugFull,
    partKnowledgeId: pid != null ? pid : "",
  };
}
