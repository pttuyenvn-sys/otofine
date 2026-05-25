import { findPublicShopBySlug } from "../shopPublic/repositories/shopPublic.repository.js";
import { normalizeSlugParam } from "../shopPublic/utils/slug.util.js";
import {
  ALLOWED_STOREFRONT_EVENT_TYPES,
  insertStorefrontEvent,
} from "./storefrontEvents.repository.js";
import { shopsiteLog, anonymizeIp } from "../shopPublic/observability/logger.js";

const ALLOWED = new Set(ALLOWED_STOREFRONT_EVENT_TYPES);

/**
 * Minimal client IP fingerprint — first hop of X-Forwarded-For with a
 * sane fallback. Mirrors the helper in `publicApiRateLimit.middleware`
 * but kept local so the controller stays self-contained.
 */
function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || req.connection?.remoteAddress || "unknown";
}

/**
 * Per-IP rate cap for the public ingest endpoint.
 *
 * Storefront analytics is the kind of thing a misbehaving plugin / bot
 * could hammer. We cap at 60 events per 60 seconds per IP, which is
 * generous enough that an enthusiastic browser session firing both
 * `storefront_view` and a few `*_click` events never hits the cap, but
 * tight enough that a tight loop gets shut out within a second.
 *
 * Process-local; if the deployment ever sharded to Redis the contract
 * is the same key shape ("ip:<addr>").
 */
const RL_WINDOW_MS = 60_000;
const RL_MAX = 60;
const rlBuckets = new Map();

function rateLimitOk(ip) {
  const now = Date.now();
  let entry = rlBuckets.get(ip);
  if (!entry || now - entry.startedAt > RL_WINDOW_MS) {
    entry = { startedAt: now, count: 0 };
    rlBuckets.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= RL_MAX;
}

/**
 * POST /api/storefront-events/track
 *
 * Body: { shopSlug: string, type: string, metadata?: object }
 *
 * Contract:
 *   - Idempotently returns 204 No Content on success — analytics
 *     beacons never need a body.
 *   - Silently swallows any unexpected error and still returns 204;
 *     a buyer-side click handler must NEVER surface an error.
 *   - Validates: known type, slug shape, resolved public shop.
 *   - On any validation failure, returns 204 anyway and logs a
 *     "storefront.event.skip" diagnostic. The seller dashboard simply
 *     won't see the event — better than blocking a CTA click.
 */
export async function handleTrackStorefrontEvent(req, res) {
  try {
    const ip = clientIp(req);
    if (!rateLimitOk(ip)) {
      shopsiteLog.warn("storefront.event.rate-limited", {
        ip: anonymizeIp(ip),
      });
      return res.status(204).end();
    }

    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const slug = normalizeSlugParam(body.shopSlug || body.slug || "");
    const type = String(body.type || "").trim().slice(0, 32);
    let metadata = body.metadata;
    if (metadata && typeof metadata !== "object") metadata = null;

    if (!slug || !ALLOWED.has(type)) {
      shopsiteLog.info("storefront.event.skip", {
        reason: !slug ? "bad_slug" : "bad_type",
        slug,
        type,
        ip: anonymizeIp(ip),
      });
      return res.status(204).end();
    }

    const shop = await findPublicShopBySlug(slug);
    if (!shop || !shop.id) {
      shopsiteLog.info("storefront.event.skip", {
        reason: "shop_not_found",
        slug,
        type,
        ip: anonymizeIp(ip),
      });
      return res.status(204).end();
    }

    await insertStorefrontEvent({
      shopId: Number(shop.id),
      eventType: type,
      metadata: metadata ? sanitizeMetadata(metadata) : null,
    });

    return res.status(204).end();
  } catch (err) {
    shopsiteLog.warn("storefront.event.error", { msg: err?.message });
    return res.status(204).end();
  }
}

/**
 * Cheap defensive sanitizer — JSON metadata is free-form by design,
 * but we cap depth + size so a malicious caller cannot fill the JSON
 * column with a megabyte of garbage. Only top-level scalar fields are
 * preserved.
 */
function sanitizeMetadata(meta) {
  const out = {};
  let kept = 0;
  for (const key of Object.keys(meta)) {
    if (kept >= 8) break;
    const v = meta[key];
    if (v == null) continue;
    if (typeof v === "string") {
      out[key] = v.slice(0, 200);
      kept += 1;
      continue;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = v;
      kept += 1;
      continue;
    }
    if (typeof v === "boolean") {
      out[key] = v;
      kept += 1;
      continue;
    }
  }
  return Object.keys(out).length ? out : null;
}
