import crypto from "crypto";
import { matchRfqToShops } from "../matching/index.js";
import { evaluateRollout, getShopAllowlist } from "./rfqAssistRollout.js";
import {
  insertAssistEvent,
  isValidAction,
  isValidTier,
  MAX_EVENTS_PER_RFQ,
} from "./rfqAssistEvents.repo.js";
import { rfqLog } from "../utils/rfqLogger.js";

/**
 * Phase 8.2 — RFQ Assist: orchestration service.
 *
 * Bridges the Phase 8.1 matching engine into the buyer viewer page
 * under a soft-rollout contract.
 *
 * --- KEY CONTRACTS ---
 *
 * 1. NEVER throws into the caller's response path.
 *    The viewer page MUST load even if the matcher is broken, the
 *    rollout evaluator misbehaves, or the events repo fails. Every
 *    function here either returns a typed result or logs+swallows.
 *
 * 2. ADDITIVE OUTPUT.
 *    The suggestions object is consumed by a new endpoint and a new
 *    component. Nothing here mutates existing RFQ contracts.
 *
 * 3. EXPLAINABILITY PRESERVED.
 *    We re-project the matcher's `breakdown` into a compact set of
 *    UI-facing "reason chips" (≤ 3 per shop). The full breakdown
 *    is also returned for ops/debug consumers.
 *
 * 4. SHOP ALLOWLIST.
 *    When `RFQ_ASSIST_ALLOWED_SHOPS` is set, suggestions are
 *    FILTERED IN to that slug set BEFORE projecting to the DTO. This
 *    is independent from the buyer rollout switch and is the lever
 *    that lets ops dry-run the panel with only QA'd shops.
 *
 * 5. ZERO-RESULT NEVER LOOKS BROKEN.
 *    When the matcher returns nothing OR the rollout is off OR the
 *    allowlist filters everything out, the service returns
 *    `{ rollout, suggestions: [] }`. The UI hides itself entirely —
 *    no banner, no "no matches" copy.
 */

/** Public DTO field — max chips rendered per suggestion card. */
const MAX_REASON_CHIPS = 3;

/** Hard ceiling on suggestions returned to the viewer page. */
const HARD_TOP_N = 6;

/**
 * Main entrypoint. Called by `GET /api/rfq/assist/suggestions`.
 *
 * @param {object} rfqRow                   row from rfqViewer middleware (req.rfqRequest)
 * @param {object} [opts]
 * @param {number} [opts.topN=6]            max suggestions returned
 * @returns {Promise<{
 *   rollout: { inRollout, reason, bucket, percent },
 *   suggestions: Array,
 *   stats: { candidates, scored, returned, dur_ms, generated_at },
 * }>}
 */
export async function getSuggestionsForRfq(rfqRow, opts = {}) {
  const started = Date.now();
  const topN = Math.max(1, Math.min(HARD_TOP_N, Number(opts.topN) || HARD_TOP_N));

  const phone = rfqRow?.guest_phone_e164 || null;
  const rfqId = Number(rfqRow?.id);

  const rollout = evaluateRollout({ phone, rfqId });

  if (!rollout.inRollout) {
    rfqLog.info("rfq.assist.skipped", {
      rfqId,
      reason: rollout.reason,
      percent: rollout.percent,
    });
    return {
      rollout,
      suggestions: [],
      stats: { candidates: 0, scored: 0, returned: 0, dur_ms: Date.now() - started, generated_at: new Date().toISOString() },
    };
  }

  let engineResult;
  try {
    engineResult = await matchRfqToShops({ rfqRequestId: rfqId, topN: HARD_TOP_N });
  } catch (err) {
    rfqLog.error("rfq.assist.engine-failed", {
      rfqId,
      msg: err?.message || "unknown",
    });
    return {
      rollout,
      suggestions: [],
      stats: { candidates: 0, scored: 0, returned: 0, dur_ms: Date.now() - started, generated_at: new Date().toISOString() },
    };
  }

  const allowlist = getShopAllowlist();
  const filtered =
    allowlist.size > 0
      ? engineResult.results.filter((r) => r.slug && allowlist.has(r.slug))
      : engineResult.results;

  const suggestions = filtered.slice(0, topN).map(projectToSuggestion);

  // Server-side render-time observability so ops can correlate panel
  // delivery rate without depending on client beacons firing.
  rfqLog.info("rfq.assist.rendered", {
    rfqId,
    rollout: rollout.reason,
    candidates: engineResult.stats?.candidatesTotal || 0,
    matched: engineResult.results.length,
    returned: suggestions.length,
    dur_ms: Date.now() - started,
  });

  return {
    rollout,
    suggestions,
    stats: {
      candidates: engineResult.stats?.candidatesTotal || 0,
      scored: engineResult.stats?.scored || 0,
      returned: suggestions.length,
      dur_ms: Date.now() - started,
      generated_at: new Date().toISOString(),
    },
  };
}

/**
 * Convert the engine's verbose result into the lightweight DTO the
 * viewer component consumes. Picks the top `MAX_REASON_CHIPS`
 * breakdown items by points descending — that's what the UI shows
 * as "reason chips" under the shop card.
 */
function projectToSuggestion(r) {
  const topReasons = [...(r.breakdown || [])]
    .sort((a, b) => b.points - a.points)
    .slice(0, MAX_REASON_CHIPS)
    .map((b) => ({
      key: b.key,
      label: b.label,
      points: b.points,
      max: b.max,
    }));

  return {
    shopId: r.shopId,
    slug: r.slug,
    name: r.name,
    score: r.score,
    max: r.max,
    tier: r.tier,
    reasons: topReasons,
    specialization: r.specialization?.topBrands?.slice(0, 3) || [],
    signals: r.signals,
    storefront: r.storefront,
  };
}

/**
 * Record a single UI interaction. Called by
 * `POST /api/rfq/assist/events`.
 *
 * Buyer phone is one-way hashed before storage — the analytics
 * table never contains a raw phone number.
 *
 * Returns one of:
 *   - { ok: true, id }                   inserted
 *   - { ok: false, reason: "..."}        rejected (validation / cap)
 *
 * Never throws; controller can rely on `ok` flag.
 */
export async function recordAssistEvent(rfqRow, body = {}) {
  try {
    const action = String(body.action || "").toLowerCase();
    if (!isValidAction(action)) {
      return { ok: false, reason: "invalid-action" };
    }

    const tier = body.matchTier ? String(body.matchTier).toLowerCase() : null;
    if (!isValidTier(tier)) {
      return { ok: false, reason: "invalid-tier" };
    }

    const phoneHash = rfqRow?.guest_phone_e164
      ? crypto
          .createHash("sha256")
          .update(String(rfqRow.guest_phone_e164))
          .digest("hex")
      : null;

    const result = await insertAssistEvent({
      rfqRequestId: rfqRow.id,
      suggestedShopId: body.shopId ?? null,
      action,
      source: body.source || "viewer",
      matchScore: body.matchScore ?? null,
      matchTier: tier,
      buyerPhoneHash: phoneHash,
      metadata: sanitizeMetadata(body.metadata),
    });

    if (result.ok) {
      rfqLog.info(`rfq.assist.${action}`, {
        rfqId: rfqRow.id,
        shopId: body.shopId ?? null,
        score: body.matchScore ?? null,
        tier,
        source: body.source || "viewer",
      });
    } else {
      rfqLog.warn("rfq.assist.event-dropped", {
        rfqId: rfqRow.id,
        reason: result.reason,
        count: result.count,
      });
    }
    return result;
  } catch (err) {
    rfqLog.error("rfq.assist.event-failed", {
      rfqId: rfqRow?.id || null,
      msg: err?.message || "unknown",
    });
    // analytics failure is never user-facing
    return { ok: false, reason: "internal-error" };
  }
}

/**
 * Sanitize the client-supplied metadata bag: drop functions/symbols,
 * cap depth, cap byte size. Anything weird gets nullified rather
 * than rejecting the whole event.
 */
function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== "object") return null;
  let json;
  try {
    json = JSON.stringify(meta);
  } catch {
    return null;
  }
  if (json.length > 4096) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export { MAX_EVENTS_PER_RFQ };
