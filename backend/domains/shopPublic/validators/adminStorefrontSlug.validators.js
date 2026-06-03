import { RESERVED_SHOP_SLUGS } from "../config/publicShop.config.js";
import { normalizeAdminGovernanceSlug } from "../utils/slug.util.js";

/**
 * Admin storefront slug format (Phase 2 + 6B governance).
 * Canonical reserved list: RESERVED_SHOP_SLUGS in publicShop.config.js.
 */
export const ADMIN_STOREFRONT_SLUG_MAX = 32;
export const ADMIN_STOREFRONT_SLUG_MIN = 3;
export const ADMIN_STOREFRONT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function formatValidationError(slug) {
  if (!slug) return "Slug is required";
  if (slug.length < ADMIN_STOREFRONT_SLUG_MIN) {
    return `Slug must be at least ${ADMIN_STOREFRONT_SLUG_MIN} characters`;
  }
  if (slug.length > ADMIN_STOREFRONT_SLUG_MAX) {
    return `Slug must be at most ${ADMIN_STOREFRONT_SLUG_MAX} characters`;
  }
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return "Slug cannot start or end with a hyphen";
  }
  if (slug.includes("--")) {
    return "Slug cannot contain consecutive hyphens";
  }
  return "Slug must use lowercase letters, numbers, and hyphens only";
}

/**
 * @param {string} rawSlug
 * @param {number} currentShopId shops.id
 * @param {number|null|undefined} ownerOfSlug shops.id that owns slug, if any
 */
export function validateAdminStorefrontSlug(rawSlug, currentShopId, ownerOfSlug) {
  const slug = normalizeAdminGovernanceSlug(rawSlug);
  if (!slug) {
    return { ok: false, code: "EMPTY", error: "Slug is required" };
  }
  if (RESERVED_SHOP_SLUGS.has(slug)) {
    return { ok: false, code: "RESERVED", error: "This slug is reserved by the platform" };
  }
  if (slug.length < ADMIN_STOREFRONT_SLUG_MIN || slug.length > ADMIN_STOREFRONT_SLUG_MAX) {
    return { ok: false, code: "LENGTH", error: formatValidationError(slug) };
  }
  if (!ADMIN_STOREFRONT_SLUG_REGEX.test(slug)) {
    return {
      ok: false,
      code: "INVALID",
      error: formatValidationError(slug),
    };
  }
  if (ownerOfSlug != null && ownerOfSlug !== currentShopId) {
    return { ok: false, code: "TAKEN", error: "Slug is already used by another shop" };
  }
  return { ok: true, slug };
}

export function buildSlugValidationState({ slug, shopId, ownerOfSlug }) {
  const normalized = slug ? normalizeAdminGovernanceSlug(slug) : "";
  const hasSlug = Boolean(normalized);
  let slugFormatValid = null;
  let isReserved = false;
  let isTaken = false;

  if (hasSlug) {
    isReserved = RESERVED_SHOP_SLUGS.has(normalized);
    slugFormatValid = ADMIN_STOREFRONT_SLUG_REGEX.test(normalized);
    isTaken = ownerOfSlug != null && ownerOfSlug !== shopId;
  }

  return {
    hasSlug,
    slugFormatValid,
    isReserved,
    isTaken,
    isValid: hasSlug && slugFormatValid && !isReserved && !isTaken,
  };
}
