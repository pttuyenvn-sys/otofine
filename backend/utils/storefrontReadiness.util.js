/**
 * Storefront readiness evaluator — read-only governance signal (Phase 6D.1).
 * Uses existing shop fields only; no DB writes.
 */

const SCORE = Object.freeze({
  name: 15,
  avatar: 15,
  cover: 15,
  phone: 10,
  intro: 15,
  slug: 10,
  publicProducts: 20,
});

const STATUS_READY_MIN = 80;
const STATUS_ATTENTION_MIN = 50;

export const STOREFRONT_READINESS_PUBLISH_MIN = STATUS_ATTENTION_MIN;

/**
 * SQL expression mirroring {@link evaluateStorefrontReadiness} for list filters.
 * @param {{ shopAlias?: string, accountAlias?: string, productCountAlias?: string }} [opts]
 */
export function storefrontReadinessScoreSql({
  shopAlias = "s",
  accountAlias = "sa",
  productCountAlias = "pc",
} = {}) {
  const s = shopAlias;
  const sa = accountAlias;
  const pc = productCountAlias;
  return `(
    (CASE WHEN TRIM(COALESCE(${sa}.name, '')) <> '' THEN 15 ELSE 0 END) +
    (CASE WHEN TRIM(COALESCE(${s}.avatar, '')) <> '' THEN 15 ELSE 0 END) +
    (CASE WHEN TRIM(COALESCE(${s}.cover_image, ${s}.cover, '')) <> '' THEN 15 ELSE 0 END) +
    (CASE WHEN TRIM(COALESCE(${s}.phone, ${sa}.phone, ${s}.zalo, ${s}.zalo_phone, '')) <> '' THEN 10 ELSE 0 END) +
    (CASE WHEN TRIM(COALESCE(${s}.intro_html, ${s}.bio, ${s}.descriptionHtml, '')) <> '' THEN 15 ELSE 0 END) +
    (CASE WHEN TRIM(COALESCE(${s}.slug, '')) <> '' THEN 10 ELSE 0 END) +
    (CASE WHEN COALESCE(${pc}.approvedModerationCount, 0) > 0 THEN 20 ELSE 0 END)
  )`;
}

const WARNING_BY_KEY = Object.freeze({
  name: "Missing shop display name",
  avatar: "No shop avatar",
  cover: "No cover image",
  phone: "Missing storefront contact phone",
  intro: "No storefront bio",
  slug: "No storefront slug",
  public_products: "No approved public products",
});

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function stripRichText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasIntroContent(shop) {
  const raw = (
    shop?.intro_html ||
    shop?.introHtml ||
    shop?.bio ||
    shop?.descriptionHtml ||
    ""
  ).toString();
  return stripRichText(raw).length > 0;
}

function hasCoverImage(shop) {
  return hasText(shop?.cover_image || shop?.coverImage || shop?.cover);
}

function hasPhoneContact(shop) {
  return (
    hasText(shop?.shopPhone || shop?.phone) ||
    hasText(shop?.accountPhone) ||
    hasText(shop?.zalo || shop?.zaloPhone)
  );
}

function approvedProductCount(shop) {
  return (
    Number(shop?.approvedModerationCount ?? shop?.approved ?? shop?.approvedProducts) || 0
  );
}

/**
 * @param {object} shop — row or admin DTO fragment
 */
export function evaluateStorefrontReadiness(shop = {}) {
  const checks = {
    hasName: hasText(shop?.name || shop?.accountName || shop?.shopDisplayName),
    hasAvatar: hasText(shop?.avatar),
    hasCover: hasCoverImage(shop),
    hasPhone: hasPhoneContact(shop),
    hasIntro: hasIntroContent(shop),
    hasSlug: hasText(shop?.slug),
    hasPublicProducts: approvedProductCount(shop) > 0,
  };

  let score = 0;
  if (checks.hasName) score += SCORE.name;
  if (checks.hasAvatar) score += SCORE.avatar;
  if (checks.hasCover) score += SCORE.cover;
  if (checks.hasPhone) score += SCORE.phone;
  if (checks.hasIntro) score += SCORE.intro;
  if (checks.hasSlug) score += SCORE.slug;
  if (checks.hasPublicProducts) score += SCORE.publicProducts;

  const missing = [];
  if (!checks.hasName) missing.push("name");
  if (!checks.hasAvatar) missing.push("avatar");
  if (!checks.hasCover) missing.push("cover");
  if (!checks.hasPhone) missing.push("phone");
  if (!checks.hasIntro) missing.push("intro");
  if (!checks.hasSlug) missing.push("slug");
  if (!checks.hasPublicProducts) missing.push("public_products");

  const warnings = missing.map((key) => WARNING_BY_KEY[key] || key);

  let status = "incomplete";
  if (score >= STATUS_READY_MIN) status = "ready";
  else if (score >= STATUS_ATTENTION_MIN) status = "attention";

  return {
    score,
    status,
    checks,
    missing,
    warnings,
  };
}

/** Compact payload for admin list rows. */
export function compactStorefrontReadiness(readiness) {
  if (!readiness) return { score: 0, status: "incomplete" };
  return {
    score: readiness.score,
    status: readiness.status,
  };
}
