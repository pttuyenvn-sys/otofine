/**
 * Phase 6B.6 — centralized storefront indexing eligibility.
 *
 * SSR metadata uses authoritative fields from GET /api/public/shops/:slug
 * (`seoIndexable`, `seoIndexReasons`, `healthScore`). The local evaluator
 * mirrors backend rules for tests and dev diagnostics when those fields
 * are absent.
 */

export const STOREFRONT_INDEX_MIN_HEALTH_SCORE = 60;
export const STOREFRONT_INDEX_MIN_INTRO_CHARS = 40;

export const INDEX_BLOCKING_ATTENTION_FLAGS = Object.freeze([
  "storefront_suspended",
  "no_products",
  "high_reject_ratio",
  "inactive_30d",
]);

export function isStorefrontIndexingGloballyEnabled() {
  return (process.env.NEXT_PUBLIC_SHOPSITE_INDEX_ENABLED || "").trim() === "1";
}

/**
 * @param {object|null|undefined} shop Public shop DTO from API
 * @param {{ envEnabled?: boolean, log?: boolean, slug?: string }} [opts]
 */
export function evaluateStorefrontSeoIndexability(shop, opts = {}) {
  if (!shop) {
    return finalize(false, ["no_shop"], {}, opts);
  }

  if (typeof shop.seoIndexable === "boolean") {
    const breakdown = {
      contentEligible: shop.seoEligible === true,
      contentReasons: Array.isArray(shop.seoReasons) ? shop.seoReasons : [],
      healthScore: Number(shop.healthScore) || 0,
      healthLabel: shop.healthLabel || null,
      healthThreshold: STOREFRONT_INDEX_MIN_HEALTH_SCORE,
      healthOk: (Number(shop.healthScore) || 0) >= STOREFRONT_INDEX_MIN_HEALTH_SCORE,
      attentionFlags: Array.isArray(shop.attentionFlags) ? shop.attentionFlags : [],
      blockingFlags: Array.isArray(shop.indexBlockingFlags)
        ? shop.indexBlockingFlags
        : [],
      authoritative: true,
    };
    return finalize(
      shop.seoIndexable,
      shop.seoIndexReasons || [],
      breakdown,
      opts,
    );
  }

  return finalize(
    ...evaluateLocally(shop),
    opts,
  );
}

/**
 * Final robots/index decision — env flag AND per-shop eligibility.
 */
export function isStorefrontPageIndexable(shop, opts = {}) {
  const envOn =
    opts.envEnabled !== undefined
      ? opts.envEnabled
      : isStorefrontIndexingGloballyEnabled();
  const evalResult = evaluateStorefrontSeoIndexability(shop, opts);
  const indexable = envOn && evalResult.indexable;
  const reasons = indexable
    ? []
    : [
        ...(!envOn ? ["indexing_disabled"] : []),
        ...evalResult.reasons,
      ].filter(Boolean);

  if (opts.log && process.env.NODE_ENV === "development") {
    console.info("[storefront-seo-index]", {
      slug: opts.slug || shop?.slug || "unknown",
      envEnabled: envOn,
      indexable,
      reasons,
      breakdown: evalResult.breakdown,
    });
  }

  return {
    ...evalResult,
    indexable,
    reasons: [...new Set(reasons)],
    envEnabled: envOn,
  };
}

/**
 * Robots directive for storefront pages.
 * Ineligible shops stay discoverable via links (follow) but out of index.
 */
export function storefrontRobotsMetadata(shop, opts = {}) {
  const { indexable } = isStorefrontPageIndexable(shop, opts);
  return indexable
    ? { index: true, follow: true }
    : { index: false, follow: true };
}

function evaluateLocally(shop) {
  const reasons = [];
  const status = String(shop.publicStatus || shop.public_status || "public")
    .trim()
    .toLowerCase();

  if (status !== "public") reasons.push("not_public");
  if (status === "suspended") reasons.push("storefront_suspended");

  const slug = String(shop.slug || "").trim();
  if (!slug || slug.length < 4) reasons.push("bad_slug");

  const intro = String(shop.introHtml || shop.descriptionHtml || shop.shortDescription || shop.bio || "").trim();
  if (!intro) reasons.push("no_description");
  else if (stripRich(intro).length < STOREFRONT_INDEX_MIN_INTRO_CHARS) {
    reasons.push("thin_intro");
  }

  if (!shop.avatar && !shop.cover) reasons.push("no_image");
  if (!String(shop.phone || "").trim()) reasons.push("no_phone");

  const productCount = Number(shop.productCount) || 0;
  if (productCount < 1) reasons.push("no_products");

  const healthScore = Number(shop.healthScore) || estimateHealthScore(shop, productCount);
  if (healthScore < STOREFRONT_INDEX_MIN_HEALTH_SCORE) {
    reasons.push("health_below_threshold");
  }

  const attentionFlags = Array.isArray(shop.attentionFlags) ? shop.attentionFlags : [];
  for (const flag of attentionFlags) {
    if (INDEX_BLOCKING_ATTENTION_FLAGS.includes(flag) && !reasons.includes(flag)) {
      reasons.push(flag);
    }
  }

  const contentEligible = !reasons.some((r) =>
    ["not_public", "storefront_suspended", "bad_slug", "no_image", "no_description", "thin_intro", "no_phone", "no_products"].includes(r),
  );
  const blocking = attentionFlags.some((f) => INDEX_BLOCKING_ATTENTION_FLAGS.includes(f));
  const indexable =
    contentEligible &&
    !blocking &&
    healthScore >= STOREFRONT_INDEX_MIN_HEALTH_SCORE;

  const breakdown = {
    contentEligible,
    contentReasons: reasons.filter((r) => r !== "health_below_threshold"),
    healthScore,
    healthThreshold: STOREFRONT_INDEX_MIN_HEALTH_SCORE,
    healthOk: healthScore >= STOREFRONT_INDEX_MIN_HEALTH_SCORE,
    attentionFlags,
    blockingFlags: attentionFlags.filter((f) =>
      INDEX_BLOCKING_ATTENTION_FLAGS.includes(f),
    ),
    authoritative: false,
  };

  return [indexable, indexable ? [] : [...new Set(reasons)], breakdown];
}

function estimateHealthScore(shop, productCount) {
  let score = 50;
  const status = String(shop.publicStatus || shop.public_status || "").toLowerCase();
  if (status === "public") score += 15;
  if (productCount > 0) score += 15;
  if (String(shop.phone || "").trim()) score += 5;
  if (shop.avatar || shop.cover) score += 5;
  return Math.max(0, Math.min(100, score));
}

function stripRich(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function finalize(indexable, reasons, breakdown, opts) {
  const out = {
    indexable: !!indexable,
    reasons: indexable ? [] : reasons || [],
    breakdown: breakdown || {},
  };

  if (opts.log && process.env.NODE_ENV === "development") {
    const slug = opts.slug || breakdown.slug || "unknown";
    console.info("[storefront-seo-index:eval]", {
      slug,
      indexable: out.indexable,
      reasons: out.reasons,
      breakdown: out.breakdown,
    });
  }

  return out;
}
