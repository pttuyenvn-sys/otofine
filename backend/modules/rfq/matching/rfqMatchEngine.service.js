/**
 * Phase 8.1 — RFQ supplier matching: engine orchestration.
 *
 * The service entrypoint downstream callers reach for. Coordinates:
 *
 *   normalize input  →  load candidate shop ids
 *                    →  bulk-load signals for those shops
 *                    →  score each
 *                    →  rank, cap, emit observability
 *
 * Public surface:
 *
 *   matchRfqToShops({ rfqRequestId | input, topN?, candidatePool?, now?, extraScorers? })
 *     → { input, results, stats, generatedAt }
 *
 *     results: Array<{
 *       shopId, slug, name, score, tier, breakdown, max,
 *       specialization, signals: { brandProducts, partProducts, totalProducts }
 *     }>
 *
 *   matchRfqToShopsByInput(input, opts)   — when caller already has a MatchInput.
 *
 * SAFETY GUARANTEES
 *
 *   - Read-only. Never writes to any table.
 *   - Bounded work. Candidate pool capped (80 shops max), all
 *     enrichment queries are bulk SQL on shopId IN (...).
 *   - Result size capped. `topN` defaults to 10, hard ceiling 25.
 *   - Resilient to sparse inventory — the candidate pool has a wide
 *     fallback so we always return at least some shops if any exist.
 *   - Deterministic. Same RFQ + same DB state → same ranking. The
 *     scorer is pure; ties broken by (verified, totalProducts desc,
 *     shopId asc).
 *
 * ML / FUTURE HOOKS
 *
 *   `extraScorers` is an array of `(signals, input) => { key, label,
 *   points, max, evidence }`. Each return value is merged into the
 *   breakdown and added to `score`. A future ML reranker plugs in
 *   here without modifying this file.
 */

import { loadMatchInputFromRfqId } from "./rfqMatchInputs.normalizer.js";
import { loadCandidateShopIds } from "./rfqShopCandidates.repo.js";
import {
  loadShopBaseRows,
  loadShopProductCounts,
  loadShopVehicleSpecialization,
  loadShopPartSpecialization,
  loadShopBrandSpecialization,
} from "./rfqShopSpecialization.repo.js";
import { scoreShopForRfq, MAX_SCORE } from "./rfqMatchScorer.js";
import { matchLog } from "./rfqMatchLogger.js";

const DEFAULT_TOP_N = 10;
const HARD_TOP_N = 25;
const DEFAULT_CANDIDATE_POOL = 40;

/**
 * Main entry — accepts either an `rfqRequestId` (looked up from DB)
 * or a pre-built `input` (for preview/tests where you don't want a
 * real RFQ row).
 */
export async function matchRfqToShops(args = {}) {
  const opts = sanitizeOpts(args);
  const start = Date.now();

  let input = args.input;
  if (!input) {
    const id = Number(args.rfqRequestId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("matchRfqToShops: rfqRequestId or input required");
    }
    input = await loadMatchInputFromRfqId(id);
    if (!input) {
      matchLog.failed({ reason: "rfq-not-found", rfqId: id });
      throw new Error("RFQ_NOT_FOUND");
    }
  }

  matchLog.started({
    rfqId: input.rfqId,
    brand: input.vehicle?.brand || "",
    model: input.vehicle?.model || "",
    year: input.vehicle?.year || "",
    partGroups: input.part?.systemGroups || [],
    topN: opts.topN,
  });

  try {
    return await runPipeline(input, opts, start);
  } catch (err) {
    matchLog.failed({
      rfqId: input?.rfqId || 0,
      reason: "engine-exception",
      msg: err?.message || String(err),
    });
    throw err;
  }
}

/**
 * Same as `matchRfqToShops`, but the caller already has a normalised
 * `MatchInput`. Useful for back-testing on synthetic RFQs.
 */
export async function matchRfqToShopsByInput(input, opts = {}) {
  return matchRfqToShops({ input, ...opts });
}

async function runPipeline(input, opts, started) {
  const candidates = await loadCandidateShopIds(input, { candidatePool: opts.candidatePool });
  if (candidates.ids.length === 0) {
    matchLog.zeroResults({ rfqId: input.rfqId, reason: "no-candidates" });
    matchLog.completed({
      rfqId: input.rfqId,
      candidates: 0,
      returned: 0,
      bestScore: 0,
      dur_ms: Date.now() - started,
    });
    return emptyResult(input, candidates, opts, started);
  }

  // Bulk enrichment — 5 parallel grouped queries, each one O(N) in
  // the candidate pool. Total round trips: 5.
  const baseRowsP = loadShopBaseRows(candidates.ids);
  const totalCountsP = loadShopProductCounts(candidates.ids);
  const vehicleSpecP = loadShopVehicleSpecialization(candidates.ids, input.vehicle);
  const partSpecP = loadShopPartSpecialization(candidates.ids, input.part);
  const [baseRows, totalCounts, vehicleSpec, partSpec] = await Promise.all([
    baseRowsP, totalCountsP, vehicleSpecP, partSpecP,
  ]);
  // brand specialization needs totalCounts to compute shares, so it
  // runs after the parallel batch above. Cheap query.
  const brandSpec = await loadShopBrandSpecialization(candidates.ids, totalCounts);

  // Score each candidate. Shops that failed the public-status filter
  // in `loadShopBaseRows` won't be in the map → skipped here. That's
  // the safety net for race conditions where a shop is suspended
  // between the candidate query and the enrichment query.
  const scored = [];
  for (const shopId of candidates.ids) {
    const row = baseRows.get(shopId);
    if (!row) continue;
    const signals = {
      row,
      totalProducts: totalCounts.get(shopId) || 0,
      vehicle: vehicleSpec.get(shopId) || null,
      part: partSpec.get(shopId) || null,
      topBrands: brandSpec.get(shopId) || [],
    };
    const result = scoreShopForRfq(signals, input, opts.now);

    // Future-ready hook: run any extra scorers and merge their
    // contributions. Each contribution must declare its own `max`
    // because total score can exceed MAX_SCORE when ML reranking is
    // active — callers downstream are aware of this.
    if (opts.extraScorers?.length) {
      for (const fn of opts.extraScorers) {
        try {
          const extra = fn(signals, input);
          if (extra && typeof extra === "object") {
            const pts = Math.max(0, Number(extra.points) || 0);
            const max = Math.max(0, Number(extra.max) || pts);
            if (pts > 0) {
              result.breakdown.push({
                key: String(extra.key || "extra"),
                label: String(extra.label || "Extra signal"),
                points: pts,
                max,
                evidence: extra.evidence || null,
                source: extra.source || "extraScorer",
              });
              result.score += pts;
            }
          }
        } catch {
          // extra scorers must NEVER break the pipeline.
        }
      }
    }

    scored.push({
      shopId,
      row,
      signals: {
        brandProducts: vehicleSpec.get(shopId)?.brandProductCount || 0,
        partProducts: partSpec.get(shopId)?.partProductCount || 0,
        totalProducts: totalCounts.get(shopId) || 0,
        hasModelMatch: !!vehicleSpec.get(shopId)?.hasModelMatch,
        hasYearMatch: !!vehicleSpec.get(shopId)?.hasYearMatch,
      },
      result,
    });
  }

  // Sort: score desc, then deterministic tiebreakers — verified
  // shops first, then richer inventory, then shopId asc.
  scored.sort((a, b) => {
    if (b.result.score !== a.result.score) return b.result.score - a.result.score;
    const av = a.row.verified_at ? 1 : 0;
    const bv = b.row.verified_at ? 1 : 0;
    if (bv !== av) return bv - av;
    if (b.signals.totalProducts !== a.signals.totalProducts) {
      return b.signals.totalProducts - a.signals.totalProducts;
    }
    return a.shopId - b.shopId;
  });

  const top = scored.slice(0, opts.topN).map(toDto);

  const bestScore = top.length ? top[0].score : 0;
  matchLog.completed({
    rfqId: input.rfqId,
    candidates: candidates.ids.length,
    scored: scored.length,
    returned: top.length,
    bestScore,
    dur_ms: Date.now() - started,
  });
  if (top.length > 0) {
    matchLog.topSuppliers({
      rfqId: input.rfqId,
      shops: top.map((t) => ({ id: t.shopId, score: t.score, tier: t.tier })),
    });
  } else {
    matchLog.zeroResults({ rfqId: input.rfqId, reason: "no-scored-shops" });
  }

  return {
    input,
    stats: {
      candidatesTotal: candidates.ids.length,
      candidatesByBrand: candidates.counts.byBrand,
      candidatesByPart: candidates.counts.byPart,
      candidatesByGeo: candidates.counts.byGeo,
      scored: scored.length,
      returned: top.length,
      bestScore,
      durationMs: Date.now() - started,
      maxScore: MAX_SCORE,
    },
    results: top,
    generatedAt: new Date(started).toISOString(),
  };
}

function emptyResult(input, candidates, opts, started) {
  return {
    input,
    stats: {
      candidatesTotal: 0,
      candidatesByBrand: candidates.counts.byBrand,
      candidatesByPart: candidates.counts.byPart,
      candidatesByGeo: candidates.counts.byGeo,
      scored: 0,
      returned: 0,
      bestScore: 0,
      durationMs: Date.now() - started,
      maxScore: MAX_SCORE,
    },
    results: [],
    generatedAt: new Date(started).toISOString(),
  };
}

function toDto({ shopId, row, signals, result }) {
  return {
    shopId,
    slug: row.slug || null,
    name: row.name || null,
    score: result.score,
    tier: result.tier,
    max: result.max,
    breakdown: result.breakdown,
    specialization: {
      topBrands: result.specialization.topBrands,
    },
    signals,
    storefront: {
      verified: !!row.verified_at,
      provinceId: row.provinceId || null,
      lastSeenAt: row.last_seen_at || null,
    },
  };
}

function sanitizeOpts(args) {
  const topN = clampInt(args.topN, 1, HARD_TOP_N, DEFAULT_TOP_N);
  const candidatePool = clampInt(args.candidatePool, 8, 80, DEFAULT_CANDIDATE_POOL);
  const now = Number.isFinite(args.now) ? Number(args.now) : Date.now();
  const extraScorers = Array.isArray(args.extraScorers) ? args.extraScorers.filter((f) => typeof f === "function") : null;
  return { topN, candidatePool, now, extraScorers };
}

function clampInt(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
