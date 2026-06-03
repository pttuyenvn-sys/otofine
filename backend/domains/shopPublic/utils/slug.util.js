import { SLUG_REGEX, RESERVED_SHOP_SLUGS } from "../config/publicShop.config.js";

/**
 * Normalize a Vietnamese (or any unicode) string into a DNS-safe slug.
 * - lowercase
 * - strip diacritics (Vietnamese tones, đ → d)
 * - keep only [a-z0-9-]
 * - collapse repeated dashes
 * - trim leading/trailing dashes
 *
 *   "Cửa Hàng Ô Tô 355"  →  "cua-hang-o-to-355"
 *   "Cửa Hàng Ô Tô 355!" →  "cua-hang-o-to-355"
 *
 * For the compact "no spaces" form used in the spec example
 * ("cuahangoto355") the caller can pass { compact: true }.
 */
export function slugify(input, { compact = false } = {}) {
  if (input == null) return "";
  let s = String(input).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/đ/g, "d").replace(/Đ/g, "d");
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, compact ? "" : "-");
  s = s.replace(/-+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  return s;
}

/**
 * True iff the slug matches the DNS-safe regex AND is not reserved.
 */
export function isValidShopSlug(slug) {
  if (typeof slug !== "string") return false;
  const s = slug.toLowerCase();
  if (!SLUG_REGEX.test(s)) return false;
  if (RESERVED_SHOP_SLUGS.has(s)) return false;
  return true;
}

/** Sanitize a slug from a URL param (lowercase + trim). Does NOT validate. */
export function normalizeSlugParam(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

/**
 * Admin governance slug normalization — spaces/diacritics → hyphenated slug.
 * "Phu Tung Toyota" → "phu-tung-toyota"
 */
export function normalizeAdminGovernanceSlug(raw) {
  return slugify(raw, { compact: false });
}
