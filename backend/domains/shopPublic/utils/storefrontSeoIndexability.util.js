import { deriveShopHealth } from "../../../utils/adminShopHealth.util.js";
import {
  RESERVED_SHOP_SLUGS,
  SLUG_REGEX,
} from "../config/publicShop.config.js";

/** Minimum governance health score required for Google indexing. */
export const STOREFRONT_INDEX_MIN_HEALTH_SCORE = 60;

/** Minimum stripped intro/bio length — blocks placeholder one-liners. */
export const STOREFRONT_INDEX_MIN_INTRO_CHARS = 40;

/** Attention flags that block indexing even when content gates pass. */
export const INDEX_BLOCKING_ATTENTION_FLAGS = Object.freeze([
  "storefront_suspended",
  "no_products",
  "high_reject_ratio",
  "inactive_30d",
]);

/**
 * Content completeness gate (Phase 5.5) — mirrors seller SEO readiness
 * "gate" items. Does NOT include governance health.
 */
export function evaluateContentSeoEligibility(row, productCount) {
  if (!row) return { eligible: false, reasons: ["internal"] };
  const reasons = [];
  const status = (row.public_status || "").toLowerCase();
  if (status !== "public") reasons.push("not_public");
  if (status === "suspended") reasons.push("storefront_suspended");

  const slug = (row.slug || "").trim();
  if (!slug || slug.length < 4) reasons.push("bad_slug");
  if (slug && !SLUG_REGEX.test(slug.toLowerCase())) reasons.push("invalid_slug_dns");
  if (slug && RESERVED_SHOP_SLUGS.has(slug.toLowerCase())) reasons.push("reserved_slug");

  if (!row.avatar && !row.cover && !row.cover_image) reasons.push("no_image");

  const introRaw = (row.intro_html || row.descriptionHtml || row.bio || "")
    .toString()
    .trim();
  if (!introRaw) reasons.push("no_description");
  else if (stripRichText(introRaw).length < STOREFRONT_INDEX_MIN_INTRO_CHARS) {
    reasons.push("thin_intro");
  }

  if (!(row.phone || "").toString().trim()) reasons.push("no_phone");

  const count = Number(productCount) || 0;
  if (count < 1) reasons.push("no_products");

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Phase 6B.6 — authoritative storefront indexing eligibility.
 *
 * Indexable when ALL hold:
 *   - content SEO gates pass (public, slug, image, intro, phone, products)
 *   - governance healthScore >= 60
 *   - no blocking attention flags (inactive, high reject ratio, suspended, …)
 *
 * Uses existing `deriveShopHealth()` — no schema changes.
 *
 * @param {object} input
 * @returns {{ indexable: boolean, reasons: string[], breakdown: object }}
 */
export function evaluateStorefrontSeoIndexability(input = {}) {
  const row = input.row || input.shop || null;
  const productCount = Number(input.productCount ?? input.publicProductCount) || 0;
  const content = evaluateContentSeoEligibility(row, productCount);

  const reasons = [...content.reasons];

  const activityAt =
    input.lastStorefrontActivityAt ||
    input.latestProductAt ||
    row?.updatedAt ||
    null;

  const health = deriveShopHealth({
    shopPublicStatus: row?.public_status,
    publicStatus: row?.public_status,
    slug: row?.slug,
    phone: row?.phone,
    zalo: row?.zalo || row?.zalo_phone,
    productCount,
    approvedModerationCount: input.approvedModerationCount,
    rejectedModerationCount: input.rejectedModerationCount,
    lastStorefrontActivityAt: activityAt,
  });

  for (const flag of health.attentionFlags || []) {
    if (INDEX_BLOCKING_ATTENTION_FLAGS.includes(flag) && !reasons.includes(flag)) {
      reasons.push(flag);
    }
  }

  if (health.healthScore < STOREFRONT_INDEX_MIN_HEALTH_SCORE) {
    reasons.push("health_below_threshold");
  }

  const blocking = (health.attentionFlags || []).some((f) =>
    INDEX_BLOCKING_ATTENTION_FLAGS.includes(f),
  );
  const indexable =
    content.eligible &&
    !blocking &&
    health.healthScore >= STOREFRONT_INDEX_MIN_HEALTH_SCORE;

  const uniqueReasons = [...new Set(reasons)];

  return {
    indexable,
    reasons: indexable ? [] : uniqueReasons,
    breakdown: {
      contentEligible: content.eligible,
      contentReasons: content.reasons,
      healthScore: health.healthScore,
      healthLabel: health.healthLabel,
      healthThreshold: STOREFRONT_INDEX_MIN_HEALTH_SCORE,
      healthOk: health.healthScore >= STOREFRONT_INDEX_MIN_HEALTH_SCORE,
      attentionFlags: health.attentionFlags || [],
      blockingFlags: (health.attentionFlags || []).filter((f) =>
        INDEX_BLOCKING_ATTENTION_FLAGS.includes(f),
      ),
    },
  };
}

function stripRichText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
