/**
 * ARCH-07.1 — Vietnamese slugify for shop SEO only.
 * Independent copy — do NOT import from `frontend/lib/seo/slugify.js`.
 */

/**
 * @param {string} input
 * @returns {string}
 */
export function slugifyVi(input) {
  if (input == null || typeof input !== "string") return "";
  let s = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-");
  return s.replace(/^-+|-+$/g, "").replace(/-+/g, "-");
}

/**
 * @param {string} brand
 * @returns {string}
 */
export function slugifyBrand(brand) {
  return slugifyVi(brand);
}

/**
 * @param {string} model
 * @returns {string}
 */
export function slugifyModel(model) {
  return slugifyVi(model);
}
