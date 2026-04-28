import { slugifyVi, SEO_BASE_SLUG } from "./slugify.js";

/**
 * Ghép slug landing theo xe: phu-tung-o-to | phu-tung-o-to-toyota | ...-2010
 * @param {{ brand?: string, model?: string, year?: number|string|null }} p
 */
export function buildVehicleSlug(p) {
  const parts = [SEO_BASE_SLUG];
  if (p.brand) parts.push(slugifyVi(p.brand));
  if (p.model) parts.push(slugifyVi(p.model));
  if (p.year != null && p.year !== "") {
    const y = String(p.year).trim();
    if (/^(19|20)\d{2}$/.test(y)) parts.push(y);
  }
  return parts.join("-");
}
