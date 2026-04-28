/**
 * Slugify tiếng Việt — đồng bộ với backend normalize / productSlug.
 * @param {string} input
 * @returns {string}
 */
export function slugifyVi(input) {
  if (input == null || typeof input !== "string") return "";
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/** Prefix URL cho landing phụ tùng theo xe */
export const SEO_BASE_SLUG = "phu-tung-o-to";

/** Slug đầy đủ cho category-only: ví dụ "Đèn" → den-o-to */
export function categoryLandingSlugFromName(name) {
  const s = slugifyVi(name);
  if (!s) return "";
  return `${s}-o-to`;
}
