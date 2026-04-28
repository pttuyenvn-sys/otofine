/**
 * Slug SEO: tiếng Việt không dấu, chữ thường, gạch ngang; id ở cuối đảm bảo unique.
 * Ví dụ: ket-nuoc-mazda-3-2018-12345
 */

const MAX_BASE = 180;

export function slugifyVi(input) {
  if (input == null || typeof input !== "string") return "san-pham";
  const s = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  const trimmed = s.substring(0, MAX_BASE).replace(/-+$/g, "");
  return trimmed || "san-pham";
}

/**
 * @param {{ id: number, partName?: string|null, partNumber?: string|null }} p
 */
export function buildSeoProductSlug(p) {
  const id = Number(p.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid product id for slug");

  const raw =
    (p.partName && String(p.partName).trim()) ||
    (p.partNumber && String(p.partNumber).trim()) ||
    "san-pham";

  const base = slugifyVi(raw);
  const out = `${base}-${id}`.replace(/-+/g, "-").slice(0, 255);
  return out;
}

export function legacySlugForId(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `sp-${n}`;
}
