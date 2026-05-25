import {
  getSuggestionsForRfq,
  recordAssistEvent,
} from "../assist/rfqAssist.service.js";

/**
 * Phase 8.2 — RFQ Assist HTTP controllers.
 *
 * Both handlers run AFTER `rfqViewerAuth` middleware, so `req.rfqRequest`
 * is guaranteed to be the authenticated buyer's RFQ row. No additional
 * authorization checks needed here.
 *
 * Both handlers are non-throwing — the service layer guarantees
 * graceful degradation. We never expose internal error details.
 */

const CACHE_PRIVATE_NOSTORE = "private, no-store, max-age=0";

export async function handleGetSuggestions(req, res) {
  const t = Date.now();
  try {
    const data = await getSuggestionsForRfq(req.rfqRequest, {
      topN: req.query?.topN,
    });
    // Never cache personalised suggestions at CDN/proxy layers.
    res.set("Cache-Control", CACHE_PRIVATE_NOSTORE);
    res.json({
      rollout: {
        inRollout: !!data.rollout?.inRollout,
        reason: data.rollout?.reason || "unknown",
      },
      suggestions: data.suggestions,
      stats: {
        ...data.stats,
        request_dur_ms: Date.now() - t,
      },
    });
  } catch (err) {
    // Should never happen — service layer swallows. Defensive fallback.
    res.status(200).json({
      rollout: { inRollout: false, reason: "controller-fallback" },
      suggestions: [],
      stats: { candidates: 0, scored: 0, returned: 0 },
      error_code: "ASSIST_UNAVAILABLE",
    });
  }
}

export async function handlePostEvent(req, res) {
  try {
    const body = req.body || {};
    const out = await recordAssistEvent(req.rfqRequest, body);
    if (!out.ok) {
      // Return 200 for rate-cap rejects so the client doesn't retry,
      // but use 400 for explicit validation failures.
      if (out.reason === "invalid-action" || out.reason === "invalid-tier") {
        return res.status(400).json({ ok: false, reason: out.reason });
      }
      return res.status(200).json({ ok: false, reason: out.reason });
    }
    return res.status(200).json({ ok: true, id: out.id });
  } catch {
    // Defensive — recordAssistEvent never throws, but in case the
    // wider request setup fails, we still return success-shaped JSON
    // so the buyer flow keeps moving.
    return res.status(200).json({ ok: false, reason: "internal-error" });
  }
}
