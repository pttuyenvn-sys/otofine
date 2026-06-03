/**
 * Featured storefront evaluator — read-only discovery signal (Phase 6E.1).
 * Combines readiness, quality, activity, and governance inputs; no DB writes.
 */

import { evaluateStorefrontReadiness } from "./storefrontReadiness.util.js";
import { evaluateStorefrontQuality } from "./storefrontQuality.util.js";

export const FEATURED_READINESS_MIN = 80;
const INACTIVE_MS = 30 * 24 * 60 * 60 * 1000;

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isInactive(lastActivityAt, now = Date.now()) {
  if (!lastActivityAt) return true;
  const t = new Date(lastActivityAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now - t >= INACTIVE_MS;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {object} shop — admin row, directory row, or DTO fragment
 */
export function isFeaturedStorefront(shop = {}) {
  const blockers = [];
  const reasons = [];

  const publicStatus = normalizeStatus(
    shop.publicStatus ?? shop.shopPublicStatus ?? shop.public_status,
  );
  const approved = num(shop.approvedModerationCount ?? shop.approved);
  const readiness = evaluateStorefrontReadiness(shop);
  const quality = evaluateStorefrontQuality(shop);
  const hasEnforcement = shop.hasEnforcementSuspension === true;
  const enforcementKnown = shop.hasEnforcementSuspension != null;

  if (publicStatus === "suspended") blockers.push("Storefront is suspended");
  if (publicStatus !== "public") blockers.push("Storefront is not public");
  if (!hasText(shop.slug)) blockers.push("Missing storefront slug");
  if (approved <= 0) blockers.push("No approved products");
  if (isInactive(shop.lastStorefrontActivityAt)) blockers.push("Inactive storefront (30d)");
  if (hasEnforcement) blockers.push("Active enforcement suspension");
  if (!enforcementKnown) blockers.push("Enforcement status unknown");
  if (readiness.score < FEATURED_READINESS_MIN) {
    blockers.push(`Readiness below ${FEATURED_READINESS_MIN}`);
  }
  if (quality.tier === "poor") blockers.push("Quality tier is poor");

  let score = clamp(Math.round(readiness.score * 0.35 + quality.score * 0.35), 0, 100);

  const rfq = num(shop.rfqCount30d ?? shop.rfqReceived30d);
  if (rfq >= 5) {
    score += 8;
    reasons.push("High RFQ activity");
  } else if (rfq > 0) {
    score += 4;
    reasons.push("RFQ activity in last 30 days");
  }

  const conversations = num(shop.conversations30d);
  const views = num(shop.views30d);
  const cta = num(shop.cta30d);
  if (conversations > 0 || views >= 10 || cta > 0) {
    score += 6;
    reasons.push("Strong buyer engagement");
  }

  if (quality.tier === "excellent") {
    score += 10;
    reasons.push("Excellent quality tier");
  } else if (quality.tier === "good") {
    score += 5;
    reasons.push("Good quality tier");
  }

  if (!isInactive(shop.lastStorefrontActivityAt)) {
    score += 6;
    reasons.push("Recent storefront activity");
  }

  score = clamp(score, 0, 100);

  const eligible = blockers.length === 0;
  if (eligible) {
    reasons.unshift("Meets featured eligibility rules");
    if (readiness.score >= FEATURED_READINESS_MIN) {
      reasons.push(`Readiness score ${readiness.score}`);
    }
  }

  return {
    eligible,
    score,
    reasons,
    blockers,
  };
}

/** Compact payload for admin list rows. */
export function compactFeaturedStorefront(featured) {
  if (!featured) return { eligible: false, score: 0 };
  return {
    eligible: Boolean(featured.eligible),
    score: featured.score,
  };
}
