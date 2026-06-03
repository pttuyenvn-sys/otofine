/**
 * Storefront quality evaluator — read-only governance intelligence (Phase 6D.4).
 * Deterministic scoring from existing shop/product/metrics fields; no DB writes.
 */

import { evaluateStorefrontReadiness } from "./storefrontReadiness.util.js";

const TIER_EXCELLENT_MIN = 85;
const TIER_GOOD_MIN = 70;
const TIER_BASIC_MIN = 50;
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

const SIGNAL_MAX = 20;

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

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isRecent(value, now = Date.now()) {
  if (!value) return false;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t < RECENT_MS;
}

function rejectRatio(rejected, total) {
  const r = num(rejected);
  const t = num(total);
  if (t <= 0) return 0;
  return r / t;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function scoreBranding(shop) {
  let score = 0;
  const checks = {
    avatar: hasText(shop?.avatar),
    cover: hasCoverImage(shop),
    intro: hasIntroContent(shop),
    slug: hasText(shop?.slug),
  };

  if (checks.avatar) score += 5;
  if (checks.cover) score += 5;
  if (checks.intro) score += 5;
  if (checks.slug) score += 5;

  return { score: clamp(score, 0, SIGNAL_MAX), checks };
}

function scoreCatalog(shop) {
  const approved = num(shop?.approvedModerationCount ?? shop?.approved);
  const withImage = num(shop?.approvedWithImageCount);
  const withPrice = num(shop?.approvedWithPriceCount);
  const hasImageCounts = shop?.approvedWithImageCount != null;
  const hasPriceCounts = shop?.approvedWithPriceCount != null;

  let score = 0;
  if (approved >= 10) score += 8;
  else if (approved >= 5) score += 6;
  else if (approved >= 1) score += 4;

  if (approved > 0) {
    if (hasImageCounts) {
      score += clamp(Math.round((withImage / approved) * 6), 0, 6);
    } else if (approved >= 5) {
      score += 3;
    }

    if (hasPriceCounts) {
      score += clamp(Math.round((withPrice / approved) * 6), 0, 6);
    } else if (approved >= 5) {
      score += 3;
    }
  }

  return {
    score: clamp(score, 0, SIGNAL_MAX),
    approved,
    withImage,
    withPrice,
    hasImageCounts,
    hasPriceCounts,
  };
}

function scoreActivity(shop) {
  let score = 0;
  const recentlyActive = isRecent(shop?.lastStorefrontActivityAt);
  const recentlyUpdated = isRecent(shop?.shopUpdatedAt ?? shop?.updatedAt);
  const rfqCount = num(shop?.rfqCount30d ?? shop?.rfqReceived30d);

  if (recentlyActive) score += 8;
  if (recentlyUpdated) score += 6;
  if (rfqCount > 0) score += 6;

  return {
    score: clamp(score, 0, SIGNAL_MAX),
    recentlyActive,
    recentlyUpdated,
    rfqCount,
  };
}

function scoreTrust(shop) {
  const productCount = num(shop?.productCount ?? shop?.totalProducts);
  const rejected = num(shop?.rejectedModerationCount ?? shop?.rejected);
  const ratio = rejectRatio(rejected, productCount);
  const lowRejection = rejected < 2 || ratio < 0.2;
  const hasEnforcement = shop?.hasEnforcementSuspension === true;
  const enforcementKnown = shop?.hasEnforcementSuspension != null;
  const publicStatus = String(shop?.publicStatus ?? shop?.shopPublicStatus ?? "")
    .trim()
    .toLowerCase();
  const accountStatus = String(shop?.accountStatus ?? "").trim().toLowerCase();
  const verifiedPhone = hasPhoneContact(shop);
  const verifiedShop = Boolean(shop?.verifiedAt ?? shop?.verified_at);

  let score = 0;
  if (verifiedPhone) score += 6;
  if (verifiedShop) score += 4;
  if (enforcementKnown) {
    if (!hasEnforcement) score += 6;
  } else if (accountStatus !== "blocked" && accountStatus !== "suspended") {
    score += 3;
  }
  if (lowRejection) score += 4;
  if (publicStatus === "suspended") score = clamp(score - 8, 0, SIGNAL_MAX);

  return {
    score: clamp(score, 0, SIGNAL_MAX),
    verifiedPhone,
    verifiedShop,
    hasEnforcement,
    lowRejection,
    rejectRatio: ratio,
  };
}

function scoreEngagement(shop) {
  const rfq = num(shop?.rfqCount30d ?? shop?.rfqReceived30d);
  const conversations = num(shop?.conversations30d);
  const views = num(shop?.views30d);
  const cta = num(shop?.cta30d);
  const readiness = evaluateStorefrontReadiness(shop);
  const completeness = clamp(Math.round((readiness.score / 100) * 6), 0, 6);

  let score = completeness;
  if (rfq > 0) score += 5;
  if (conversations > 0) score += 5;
  else if (views > 0 || cta > 0) score += 4;

  return {
    score: clamp(score, 0, SIGNAL_MAX),
    rfq,
    conversations,
    views,
    cta,
    completeness,
  };
}

function tierFromScore(score) {
  if (score >= TIER_EXCELLENT_MIN) return "excellent";
  if (score >= TIER_GOOD_MIN) return "good";
  if (score >= TIER_BASIC_MIN) return "basic";
  return "poor";
}

function buildStrengths({ branding, catalog, activity, trust, engagement }) {
  const items = [];
  if (branding.score >= 15) items.push("Complete storefront branding");
  else {
    if (branding.checks.avatar && branding.checks.cover) items.push("Strong visual branding");
    if (branding.checks.intro) items.push("Storefront intro content present");
  }
  if (catalog.approved >= 10) items.push("Large approved product catalog");
  else if (catalog.approved >= 5) items.push("Healthy approved catalog size");
  if (catalog.hasImageCounts && catalog.approved > 0 && catalog.withImage / catalog.approved >= 0.8) {
    items.push("Strong product image coverage");
  }
  if (catalog.hasPriceCounts && catalog.approved > 0 && catalog.withPrice / catalog.approved >= 0.8) {
    items.push("Strong pricing coverage");
  }
  if (activity.recentlyActive) items.push("Recently active storefront");
  if (activity.rfqCount > 0) items.push("RFQ participation in last 30 days");
  if (trust.verifiedPhone) items.push("Verified storefront contact");
  if (trust.verifiedShop) items.push("Shop verification on file");
  if (trust.lowRejection) items.push("Low product rejection rate");
  if (engagement.conversations > 0) items.push("Active buyer conversations");
  if (engagement.views > 0) items.push("Storefront traffic in last 30 days");
  return items.slice(0, 6);
}

function buildWeaknesses({ branding, catalog, activity, trust, engagement }) {
  const items = [];
  if (!branding.checks.avatar) items.push("Missing shop avatar");
  if (!branding.checks.cover) items.push("Missing cover image");
  if (!branding.checks.intro) items.push("Missing storefront intro");
  if (!branding.checks.slug) items.push("Missing storefront slug");
  if (catalog.approved === 0) items.push("No approved public products");
  else {
    if (catalog.hasImageCounts && catalog.withImage / Math.max(catalog.approved, 1) < 0.5) {
      items.push("Low product image coverage");
    }
    if (catalog.hasPriceCounts && catalog.withPrice / Math.max(catalog.approved, 1) < 0.5) {
      items.push("Low pricing coverage");
    }
  }
  if (!activity.recentlyActive) items.push("Inactive storefront (30d)");
  if (!activity.recentlyUpdated) items.push("Storefront profile not updated recently");
  if (activity.rfqCount === 0) items.push("No RFQ participation (30d)");
  if (!trust.verifiedPhone) items.push("Missing verified contact phone");
  if (!trust.lowRejection) items.push("Elevated product rejection rate");
  if (engagement.completeness < 3) items.push("Low storefront completeness");
  if (engagement.rfq === 0 && engagement.conversations === 0) {
    items.push("Limited buyer engagement signals");
  }
  return items.slice(0, 6);
}

function buildFlags(shop, { branding, catalog, activity, trust }) {
  const flags = [];
  const publicStatus = String(shop?.publicStatus ?? shop?.shopPublicStatus ?? "")
    .trim()
    .toLowerCase();

  if (publicStatus === "suspended") flags.push("storefront_suspended");
  if (trust.hasEnforcement) flags.push("enforcement_suspended");
  if (!activity.recentlyActive) flags.push("inactive_30d");
  if (!trust.lowRejection) flags.push("high_reject_ratio");
  if (catalog.approved === 0) flags.push("sparse_catalog");
  if (branding.score < 10) flags.push("missing_branding");
  if (activity.rfqCount === 0) flags.push("no_rfq_activity");
  if (!trust.verifiedPhone) flags.push("unverified_contact");
  return flags;
}

/**
 * @param {object} shop — admin list/detail row or DTO fragment
 */
export function evaluateStorefrontQuality(shop = {}) {
  const branding = scoreBranding(shop);
  const catalog = scoreCatalog(shop);
  const activity = scoreActivity(shop);
  const trust = scoreTrust(shop);
  const engagement = scoreEngagement(shop);

  const signals = {
    branding: branding.score,
    catalog: catalog.score,
    activity: activity.score,
    trust: trust.score,
    engagement: engagement.score,
  };

  const score = clamp(
    signals.branding + signals.catalog + signals.activity + signals.trust + signals.engagement,
    0,
    100,
  );

  const tier = tierFromScore(score);
  const strengths = buildStrengths({ branding, catalog, activity, trust, engagement });
  const weaknesses = buildWeaknesses({ branding, catalog, activity, trust, engagement });
  const flags = buildFlags(shop, { branding, catalog, activity, trust });

  return {
    score,
    tier,
    signals,
    strengths,
    weaknesses,
    flags,
  };
}

/** Compact payload for admin list rows. */
export function compactStorefrontQuality(quality) {
  if (!quality) return { score: 0, tier: "poor" };
  return {
    score: quality.score,
    tier: quality.tier,
  };
}
