/**
 * Slugify tiếng Việt — đồng bộ với backend normalize / productSlug và
 * với `backend/domains/shopPublic/utils/slug.util.js`.
 *
 * @param {string} input
 * @param {{ compact?: boolean }} [opts]
 *   - compact: nếu true, bỏ luôn dấu '-' (dùng cho shop slug compact mode).
 *     "Cửa Hàng Mazda Hải Phòng" → "cuahangmazdahaiphong"
 * @returns {string}
 */
export function slugifyVi(input, { compact = false } = {}) {
  if (input == null || typeof input !== "string") return "";
  const separator = compact ? "" : "-";
  let s = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, separator);
  if (!compact) {
    s = s.replace(/^-+|-+$/g, "").replace(/-+/g, "-");
  }
  return s;
}

/** Prefix URL cho landing phụ tùng theo xe */
export const SEO_BASE_SLUG = "phu-tung-o-to";

/** Slug đầy đủ cho category-only: ví dụ "Đèn" → den-o-to */
export function categoryLandingSlugFromName(name) {
  const s = slugifyVi(name);
  if (!s) return "";
  return `${s}-o-to`;
}
