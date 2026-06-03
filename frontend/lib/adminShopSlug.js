import { APEX_ORIGIN } from "@/lib/apexOrigin";
import { getSiteUrl } from "@/lib/seo/siteUrl";

/** Min slug length — matches backend governance validator. */
export const SLUG_MIN_LENGTH = 3;

/** Max slug length — matches planned governance constraint. */
export const SLUG_MAX_LENGTH = 32;

/** Reserved slugs — blocked from assignment. */
export const SLUG_RESERVED_WORDS = Object.freeze([
  "www",
  "api",
  "admin",
  "seller",
  "rfq",
  "cdn",
  "static",
  "app",
  "shop",
]);

const RESERVED_SET = new Set(SLUG_RESERVED_WORDS);

/**
 * Public site origin for apex fallback URLs.
 * Uses NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APEX_URL when set.
 */
export function getPublicSiteOrigin() {
  return APEX_ORIGIN || getSiteUrl();
}

function apexHostname() {
  try {
    return new URL(getPublicSiteOrigin()).hostname.replace(/^www\./, "");
  } catch {
    return "otofine.com";
  }
}

/**
 * Normalize draft slug input for admin governance UI.
 * Spaces → hyphens; lowercase; collapse repeated hyphens.
 * "Phu Tung Toyota" → "phu-tung-toyota"
 */
export function normalizeSlugDraft(raw) {
  let s = String(raw || "").trim().toLowerCase();
  s = s.replace(/\s+/g, "-");
  s = s.replace(/[^a-z0-9-]+/g, "-");
  s = s.replace(/-+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  return s;
}

/**
 * Validate slug draft for admin governance UI.
 * @param {string} raw
 * @returns {{ slug: string, errors: string[], valid: boolean }}
 */
export function validateSlugDraft(raw) {
  const slug = normalizeSlugDraft(raw);
  const errors = [];

  if (!slug) {
    errors.push("Slug không được để trống.");
  }
  if (slug && slug.length < SLUG_MIN_LENGTH) {
    errors.push(`Tối thiểu ${SLUG_MIN_LENGTH} ký tự.`);
  }
  if (slug && !/^[a-z0-9-]+$/.test(slug)) {
    errors.push("Chỉ cho phép a-z, 0-9 và dấu gạch ngang (-).");
  }
  if (slug.startsWith("-") || slug.endsWith("-")) {
    errors.push("Slug không được bắt đầu hoặc kết thúc bằng dấu gạch ngang.");
  }
  if (slug.includes("--")) {
    errors.push("Slug không được chứa hai dấu gạch ngang liên tiếp.");
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    errors.push(`Tối đa ${SLUG_MAX_LENGTH} ký tự.`);
  }
  if (RESERVED_SET.has(slug)) {
    errors.push(`"${slug}" là từ reserved — không thể dùng.`);
  }

  return {
    slug,
    errors,
    valid: errors.length === 0 && slug.length > 0,
  };
}

/**
 * Build subdomain + apex preview URLs for a slug draft.
 * @param {string} slug normalized slug
 */
export function buildSlugPreviewUrls(slug) {
  const s = normalizeSlugDraft(slug);
  if (!s) return null;
  const host = apexHostname();
  const apex = getPublicSiteOrigin();
  return {
    subdomain: `https://${s}.${host}`,
    apex: `${apex}/shops/${s}`,
  };
}

/**
 * Resolve preview URLs from shop row / detail payload when available.
 * @param {object} shop
 */
export function resolveStorefrontDomainPreview(shop) {
  const slug = shop?.slug ?? null;
  const preview = shop?.storefrontPreview || null;
  const storefront = shop?.storefront || null;

  const subdomain =
    preview?.subdomain || storefront?.subdomain || (slug ? buildSlugPreviewUrls(slug)?.subdomain : null);
  const apex = preview?.apex || storefront?.apex || (slug ? buildSlugPreviewUrls(slug)?.apex : null);
  const primary = preview?.primary || storefront?.primary || subdomain || apex;

  return { slug, subdomain, apex, primary };
}
