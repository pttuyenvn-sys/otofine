/**
 * Phase 8.1 — RFQ supplier matching: deterministic scorer.
 *
 * Pure function. Same inputs → same outputs. No DB, no clock except
 * an injectable `now` for freshness math.
 *
 * --- DESIGN PRINCIPLES ---
 *
 * 1. SUMMABLE TO 100. Every weight is declared in `WEIGHTS` and the
 *    constant `MAX_SCORE` asserts the sum at module-load time. If a
 *    future contributor adjusts a weight, the boot fails fast — the
 *    score scale never silently drifts.
 *
 * 2. EXPLAINABLE. The return shape includes a `breakdown` array
 *    where each entry is `{ key, label, points, max, evidence }`.
 *    `evidence` is short, structured text the admin preview can
 *    render verbatim ("3 sản phẩm Toyota trong kho", "Đã xác minh").
 *
 * 3. NO RANDOMNESS. Tiebreakers are also deterministic: when two
 *    shops score identically, the engine sorts by (verified, total
 *    products desc, shopId asc).
 *
 * 4. ML-READY. The function consumes a `Signals` bag (already
 *    bulk-loaded). A future ML reranker can ingest the same bag,
 *    output a `mlScore`, and the engine blends it with the
 *    deterministic score — no scorer changes needed.
 *
 * --- WEIGHT MAP ---
 *
 *   Vehicle fit (40)
 *     brandSpecialization   20    shop sells products for the RFQ brand
 *     modelExact            10    shop has a product applied to the exact model
 *     yearOverlap           10    shop has a product applied to the RFQ year
 *
 *   Part fit (25)
 *     systemGroupMatch      15    shop has products in the resolved system_group(s)
 *     categoryTagMatch       5    shop has products with the resolved category_tag
 *     partInventoryDepth     5    log-scaled count of system_group products
 *
 *   Trust & quality (20)
 *     verified               8    shops.verified_at not null
 *     responsive             4    shop has phone + (zalo or facebook)
 *     storefrontPolish       4    avatar + cover + bio + intro present
 *     freshness              4    last_seen_at within 7 days
 *
 *   Inventory volume (10)
 *     totalProductsTier      6    log-scaled total inventory
 *     brandInventoryShare    4    brand products / total ≥ 0.20 → 4 pts
 *
 *   Geography (5)
 *     sameProvince           5    shop.provinceId === buyer.provinceId
 *
 *   Grand total max = 100.
 */

const WEIGHTS = Object.freeze({
  brandSpecialization: 20,
  modelExact:          10,
  yearOverlap:         10,
  systemGroupMatch:    15,
  categoryTagMatch:     5,
  partInventoryDepth:   5,
  verified:             8,
  responsive:           4,
  storefrontPolish:     4,
  freshness:            4,
  totalProductsTier:    6,
  brandInventoryShare:  4,
  sameProvince:         5,
});

export const MAX_SCORE = 100;

(function assertWeightsSumToMax() {
  const s = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  if (s !== MAX_SCORE) {
    throw new Error(
      `[rfq-match] WEIGHTS sum drift: expected ${MAX_SCORE}, got ${s}. Update WEIGHTS or MAX_SCORE in lockstep.`,
    );
  }
})();

const TIER_THRESHOLDS = Object.freeze({
  hot:  75, // > 75 → HOT — surface as top supplier
  warm: 45, // 45..75 → WARM — viable, send if quota allows
  // < 45 → COLD — only use as fallback when pool is empty
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} signals  — the per-shop signal bag (see engine)
 * @param {object} input    — the normalised MatchInput
 * @param {number} [now]    — injectable epoch ms for freshness math
 *
 * @returns {{ score, tier, breakdown, max, specialization }}
 */
export function scoreShopForRfq(signals, input, now = Date.now()) {
  if (!signals?.row) {
    return { score: 0, tier: "cold", breakdown: [], max: MAX_SCORE, specialization: { topBrands: [] } };
  }
  const row = signals.row;
  const breakdown = [];
  const add = (key, label, points, max, evidence) => {
    if (points <= 0 || max <= 0) return;
    const clamped = Math.min(points, max);
    breakdown.push({ key, label, points: clamped, max, evidence: evidence || null });
  };

  // ---- Vehicle fit ----
  if (input.vehicle?.brand && signals.vehicle?.brandProductCount > 0) {
    add(
      "brandSpecialization",
      `Chuyên ${input.vehicle.brand}`,
      WEIGHTS.brandSpecialization,
      WEIGHTS.brandSpecialization,
      `${signals.vehicle.brandProductCount} sản phẩm cho hãng ${input.vehicle.brand}`,
    );
  }
  if (signals.vehicle?.hasModelMatch) {
    add(
      "modelExact",
      `Khớp đúng model ${input.vehicle.model}`,
      WEIGHTS.modelExact,
      WEIGHTS.modelExact,
      `Có sản phẩm áp dụng cho ${input.vehicle.brand} ${input.vehicle.model}`,
    );
  }
  if (signals.vehicle?.hasYearMatch) {
    add(
      "yearOverlap",
      `Đời xe ${input.vehicle.year} nằm trong dải sản phẩm`,
      WEIGHTS.yearOverlap,
      WEIGHTS.yearOverlap,
      `Có sản phẩm có dải năm bao gồm ${input.vehicle.year}`,
    );
  }

  // ---- Part fit ----
  if (signals.part?.partProductCount > 0) {
    const sgDisplay = trimList(input.part.systemGroups, 3);
    add(
      "systemGroupMatch",
      `Chuyên hệ ${sgDisplay}`,
      WEIGHTS.systemGroupMatch,
      WEIGHTS.systemGroupMatch,
      `${signals.part.partProductCount} sản phẩm trong ${sgDisplay}`,
    );
  }
  if (signals.part?.hasCategoryTag) {
    add(
      "categoryTagMatch",
      `Loại linh kiện phù hợp`,
      WEIGHTS.categoryTagMatch,
      WEIGHTS.categoryTagMatch,
      null,
    );
  }
  const partInvPts = logTierPoints(signals.part?.partProductCount || 0, [1, 5, 25], [2, 4, WEIGHTS.partInventoryDepth]);
  if (partInvPts > 0) {
    add(
      "partInventoryDepth",
      `Tồn kho linh kiện liên quan`,
      partInvPts,
      WEIGHTS.partInventoryDepth,
      `${signals.part?.partProductCount || 0} sản phẩm liên quan`,
    );
  }

  // ---- Trust & quality ----
  if (row.verified_at) {
    add("verified", "Shop đã xác minh", WEIGHTS.verified, WEIGHTS.verified, null);
  }
  const hasIm = !!(row.zalo || row.facebook_url);
  if (row.phone && hasIm) {
    add("responsive", "Liên hệ đa kênh", WEIGHTS.responsive, WEIGHTS.responsive, null);
  } else if (row.phone || hasIm) {
    add("responsive", "Có kênh liên hệ", Math.floor(WEIGHTS.responsive / 2), WEIGHTS.responsive, null);
  }
  const polish =
    (nonEmpty(row.avatar) ? 1 : 0) +
    (nonEmpty(row.cover) ? 1 : 0) +
    (nonEmpty(row.bio) ? 1 : 0) +
    (nonEmpty(row.intro_html) ? 1 : 0);
  if (polish >= 3) {
    add("storefrontPolish", "Hồ sơ shop hoàn thiện", WEIGHTS.storefrontPolish, WEIGHTS.storefrontPolish, null);
  } else if (polish === 2) {
    add("storefrontPolish", "Hồ sơ shop cơ bản", 2, WEIGHTS.storefrontPolish, null);
  }
  const freshDays = daysSince(row.last_seen_at, now);
  if (freshDays != null && freshDays <= 1) {
    add("freshness", "Hoạt động trong 24h", WEIGHTS.freshness, WEIGHTS.freshness, null);
  } else if (freshDays != null && freshDays <= 7) {
    add("freshness", "Hoạt động trong 7 ngày", 2, WEIGHTS.freshness, null);
  }

  // ---- Inventory volume ----
  const total = signals.totalProducts || 0;
  const totalPts = logTierPoints(total, [10, 50, 200], [2, 4, WEIGHTS.totalProductsTier]);
  if (totalPts > 0) {
    add("totalProductsTier", "Quy mô kho hàng", totalPts, WEIGHTS.totalProductsTier, `${total} sản phẩm`);
  }
  if (input.vehicle?.brand && total > 0 && signals.vehicle?.brandProductCount > 0) {
    const share = signals.vehicle.brandProductCount / total;
    if (share >= 0.5) {
      add("brandInventoryShare", `Tỉ trọng kho hàng tập trung ${input.vehicle.brand}`, WEIGHTS.brandInventoryShare, WEIGHTS.brandInventoryShare, `${(share * 100).toFixed(0)}% kho cho ${input.vehicle.brand}`);
    } else if (share >= 0.2) {
      add("brandInventoryShare", `Kho hàng có tỉ trọng ${input.vehicle.brand}`, 2, WEIGHTS.brandInventoryShare, `${(share * 100).toFixed(0)}% kho cho ${input.vehicle.brand}`);
    }
  }

  // ---- Geography ----
  if (
    input.location?.provinceId &&
    row.provinceId &&
    Number(input.location.provinceId) === Number(row.provinceId)
  ) {
    add(
      "sameProvince",
      `Cùng tỉnh ${input.location.provinceLabel || ""}`.trim(),
      WEIGHTS.sameProvince,
      WEIGHTS.sameProvince,
      null,
    );
  }

  const score = breakdown.reduce((n, b) => n + b.points, 0);

  return {
    score,
    tier: classifyTier(score),
    breakdown,
    max: MAX_SCORE,
    specialization: {
      topBrands: signals.topBrands || [],
    },
  };
}

/**
 * Convenience export — the constant the engine reports back to
 * callers ("score 87 / 100"). External consumers should pull this
 * rather than hard-code 100.
 */
export const SCORE_MAX = MAX_SCORE;

/**
 * Tier classification — exposed so admin tooling / observability
 * can render the same labels the scorer used.
 */
export function classifyTier(score) {
  if (score >= TIER_THRESHOLDS.hot) return "hot";
  if (score >= TIER_THRESHOLDS.warm) return "warm";
  return "cold";
}

export const TIERS = Object.freeze({
  ...TIER_THRESHOLDS,
});

function nonEmpty(v) {
  return v != null && String(v).trim().length > 0;
}

function daysSince(dateLike, now) {
  if (!dateLike) return null;
  const t = dateLike instanceof Date ? dateLike.getTime() : new Date(dateLike).getTime();
  if (!Number.isFinite(t)) return null;
  return (now - t) / DAY_MS;
}

/**
 * Bucket `value` into one of N tiers. Used for inventory depth signals
 * where the relationship is log-shaped — going from 1 → 10 products is
 * worth more than going from 1000 → 1010.
 *
 * `thresholds` and `points` must have the same length. `points[i]` is
 * awarded when `value >= thresholds[i]`. Highest matching tier wins.
 */
/**
 * Render an array as `"a, b, c (+N nữa)"` so a 14-element list
 * doesn't blow up the breakdown label width.
 */
function trimList(list, max) {
  if (!Array.isArray(list) || list.length === 0) return "";
  if (list.length <= max) return list.join(", ");
  const head = list.slice(0, max).join(", ");
  return `${head} (+${list.length - max} nữa)`;
}

function logTierPoints(value, thresholds, points) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  let awarded = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) awarded = points[i];
  }
  return awarded;
}
