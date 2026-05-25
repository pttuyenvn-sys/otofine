import axios from "axios";
import { API_BASE } from "@/lib/config";

/**
 * Phase 8.2 — RFQ Assist API client.
 *
 * Thin axios wrappers + graceful failure semantics. Every helper
 * RESOLVES (never rejects) so the viewer page can render without
 * caring whether the analytics endpoint is up.
 *
 *   - fetchRfqAssistSuggestions(viewerToken)
 *       → { rollout, suggestions, stats } on 200
 *       → { rollout: { inRollout: false, reason: 'fetch-failed' },
 *           suggestions: [] } on ANY network/HTTP failure
 *
 *   - postRfqAssistEvent(viewerToken, payload)
 *       → { ok, id } or { ok: false, reason }
 *       → swallows every error; analytics MUST NOT break UX
 */

const ENDPOINT_SUGGEST = "/rfq/assist/suggestions";
const ENDPOINT_EVENTS  = "/rfq/assist/events";

const SUGGEST_TIMEOUT_MS = 4_000;
const EVENT_TIMEOUT_MS   = 2_500;

const EMPTY_RESULT = Object.freeze({
  rollout: Object.freeze({ inRollout: false, reason: "fetch-failed" }),
  suggestions: [],
  stats: Object.freeze({ candidates: 0, scored: 0, returned: 0 }),
});

function authHeaders(viewerToken) {
  return viewerToken ? { "X-RFQ-Viewer-Token": viewerToken } : {};
}

export async function fetchRfqAssistSuggestions(viewerToken, { signal } = {}) {
  if (!viewerToken) return EMPTY_RESULT;
  try {
    const res = await axios.get(`${API_BASE}${ENDPOINT_SUGGEST}`, {
      headers: authHeaders(viewerToken),
      timeout: SUGGEST_TIMEOUT_MS,
      signal,
    });
    return res?.data || EMPTY_RESULT;
  } catch (err) {
    // 401/404 = expired token; 429 = rate-limited; network = transient.
    // None of these should ever surface to the user — hide the panel.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[rfq.assist] fetch suggestions failed:", err?.message || err);
    }
    return EMPTY_RESULT;
  }
}

/**
 * Record an interaction event. Fire-and-forget semantics: callers do
 * NOT need to await this. The returned promise always resolves with
 * a result object so awaiters don't get an exception.
 *
 * Payload shape:
 *   {
 *     action:     "impression" | "click" | "selected" | "deselected" | "dismissed",
 *     shopId?:    number,
 *     matchScore?: number,
 *     matchTier?: "hot" | "warm" | "cold",
 *     source?:    "viewer",
 *     metadata?:  Record<string, JSONValue>
 *   }
 */
export async function postRfqAssistEvent(viewerToken, payload, { signal } = {}) {
  if (!viewerToken || !payload?.action) return { ok: false, reason: "client-noop" };
  try {
    const res = await axios.post(`${API_BASE}${ENDPOINT_EVENTS}`, payload, {
      headers: authHeaders(viewerToken),
      timeout: EVENT_TIMEOUT_MS,
      signal,
    });
    return res?.data || { ok: true };
  } catch {
    return { ok: false, reason: "post-failed" };
  }
}
