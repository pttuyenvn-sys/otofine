import crypto from "crypto";

/**
 * Phase 8.2 — RFQ Assist: rollout evaluator.
 *
 * Decides whether a given (buyer, RFQ) tuple is allowed to see
 * intelligent supplier suggestions in this build.
 *
 * THREE INDEPENDENT KILL SWITCHES (in priority order):
 *
 *   1. RFQ_ASSIST_ENABLED=false  → universal kill. Returns
 *      `{ inRollout: false, reason: "killed" }` for everyone.
 *      One env flip → no requests reach the matcher.
 *
 *   2. RFQ_ASSIST_ALLOWED_PHONES (comma-separated E.164 list) →
 *      strict allowlist mode. ONLY phones in this list see the
 *      panel, regardless of percentage. Use for internal QA.
 *
 *   3. RFQ_ASSIST_ROLLOUT_PCT (0..100) → deterministic percentage
 *      rollout. SHA-256 of (RFQ_ASSIST_SALT + phone + rfqId) → 0..99
 *      bucket. Buyer-stable: same buyer + same RFQ always lands in
 *      the same bucket across requests / page reloads / restarts.
 *
 * SHOP FILTER (orthogonal, additive):
 *
 *   RFQ_ASSIST_ALLOWED_SHOPS (comma-separated shop slugs) →
 *   suggestions returned by the matcher are FILTERED IN at the
 *   service layer. This lets ops dry-run the panel with only a
 *   curated set of "premium" shops while still validating the
 *   matcher's ranking quality on real RFQs.
 *
 * SHAPE
 *
 *   evaluateRollout({ phone, rfqId }) → {
 *     inRollout: boolean,
 *     reason:    "killed" | "no-buyer" | "allowlist" |
 *                "percent-in" | "percent-out" | "full-rollout",
 *     bucket:    number | null,   // 0..99 when percent path was taken
 *     percent:   number,          // resolved RFQ_ASSIST_ROLLOUT_PCT
 *     shopFilter: number[] | null // future-ready; not used directly here
 *   }
 *
 * Pure / deterministic. No side effects, no DB, no logs. Safe to
 * call inline from any request path.
 */

const SALT_DEFAULT = "otofine-rfq-assist-v1";

function parseFlag(raw, def = false) {
  if (raw === undefined || raw === null || raw === "") return def;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function parsePercent(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

function parseList(raw) {
  if (!raw) return new Set();
  return new Set(
    String(raw)
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Hash (salt + phone + rfqId) into 0..99 bucket. Buyer-stable
 * across the lifetime of the RFQ. Using SHA-256 means changing the
 * RFQ_ASSIST_SALT atomically reshuffles the rollout (useful for
 * staging re-buckets without touching percentages).
 */
function bucketFor(phone, rfqId, salt) {
  const h = crypto
    .createHash("sha256")
    .update(`${salt}|${String(phone || "")}|${String(rfqId || "")}`)
    .digest();
  // first 4 bytes as uint32, mod 100 → uniform 0..99
  const u32 = h.readUInt32BE(0);
  return u32 % 100;
}

/**
 * Main entrypoint. Reads env at call time (allows ops to flip flags
 * without restarting). Safe under high concurrency: pure read-only.
 */
export function evaluateRollout({ phone, rfqId } = {}) {
  const enabled = parseFlag(process.env.RFQ_ASSIST_ENABLED, false);
  const percent = parsePercent(process.env.RFQ_ASSIST_ROLLOUT_PCT ?? 0);
  const allowedPhones = parseList(process.env.RFQ_ASSIST_ALLOWED_PHONES);
  const salt = process.env.RFQ_ASSIST_SALT || SALT_DEFAULT;

  if (!enabled) {
    return { inRollout: false, reason: "killed", bucket: null, percent };
  }

  if (allowedPhones.size > 0 && allowedPhones.has(String(phone || ""))) {
    return { inRollout: true, reason: "allowlist", bucket: null, percent };
  }

  if (!phone) {
    return { inRollout: false, reason: "no-buyer", bucket: null, percent };
  }

  if (percent >= 100) {
    return { inRollout: true, reason: "full-rollout", bucket: null, percent };
  }
  if (percent <= 0) {
    return { inRollout: false, reason: "percent-out", bucket: null, percent };
  }

  const bucket = bucketFor(phone, rfqId, salt);
  if (bucket < percent) {
    return { inRollout: true, reason: "percent-in", bucket, percent };
  }
  return { inRollout: false, reason: "percent-out", bucket, percent };
}

/**
 * Parse the shop-slug allowlist. Returned as a Set<string> for O(1)
 * containment checks in the assist service. Empty set = no filter
 * (matcher's natural top-N is returned untouched).
 */
export function getShopAllowlist() {
  return parseList(process.env.RFQ_ASSIST_ALLOWED_SHOPS);
}
