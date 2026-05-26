import { pool } from "../config/db.js";
import {
  countShopEventsByType,
  CTA_EVENT_TYPES,
} from "../domains/storefrontEvents/storefrontEvents.repository.js";

/**
 * Seller dashboard metrics aggregator.
 *
 * Backs the new "Shop metrics" overview rendered at the top of
 * `/shop/settings`. The endpoint is read-only, additive, and runs
 * its sub-queries in parallel so opening the settings page is never
 * gated on the slowest count.
 *
 * Design notes:
 *   - Aggregate queries ONLY. Every count is a single SELECT.
 *   - No N+1: the event-types breakdown is one GROUP BY per shop.
 *   - Cache-safe by design — there is no shared mutable state. The
 *     caller (controller) can wrap in `res.set('Cache-Control', ...)`
 *     if it wants HTTP caching, but the seller-side numbers should
 *     be fresh on every load.
 *   - Schema-safe: any new event type added to the storefront analytics
 *     bus simply shows up in `eventCounts` automatically — no DB or
 *     code change required here.
 */

const RFQ_RECEIVED_WINDOW_DAYS = 30;
const CONVERSATIONS_ACTIVE_WINDOW_DAYS = 30;

async function countProducts(shopId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c FROM products WHERE shopId = ?`,
    [shopId],
  );
  return Number(row?.c) || 0;
}

async function countRfqReceived(shopId, sinceDays) {
  // Total dispatches sent to this shop in the trailing window. We
  // intentionally include every status: the seller cares about
  // pipeline volume, not just unread.
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c
       FROM rfq_dispatches d
       INNER JOIN rfq_requests r ON r.id = d.rfq_request_id
      WHERE d.shop_id = ?
        AND r.deleted_at IS NULL
        AND COALESCE(r.spam_flag, 0) = 0
        AND d.created_at >= (NOW() - INTERVAL ? DAY)`,
    [shopId, sinceDays],
  );
  return Number(row?.c) || 0;
}

/**
 * Anchored "today" counters (00:00:00 → now in server time).
 *
 * Separate from the trailing N-day counters because the seller's
 * operational dashboard cares about "what happened TODAY" — a
 * trailing-24h window would re-include events from yesterday
 * evening which is misleading right after midnight.
 */
async function countRfqReceivedToday(shopId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c
       FROM rfq_dispatches d
       INNER JOIN rfq_requests r ON r.id = d.rfq_request_id
      WHERE d.shop_id = ?
        AND r.deleted_at IS NULL
        AND COALESCE(r.spam_flag, 0) = 0
        AND d.created_at >= CURDATE()`,
    [shopId],
  );
  return Number(row?.c) || 0;
}

async function countOutOfStockProducts(shopId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c FROM products
      WHERE shopId = ? AND COALESCE(stock, 0) <= 0`,
    [shopId],
  );
  return Number(row?.c) || 0;
}

async function countShopEventsToday(shopId) {
  if (!shopId) return {};
  const [rows] = await pool.query(
    `SELECT event_type, COUNT(*) AS c
       FROM shop_storefront_events
      WHERE shop_id = ?
        AND occurred_at >= CURDATE()
      GROUP BY event_type`,
    [shopId],
  );
  const out = {};
  for (const r of rows) out[r.event_type] = Number(r.c) || 0;
  return out;
}

/**
 * Returning-buyers today (sales-intelligence pass).
 *
 * "Returning" = the buyer's phone has already appeared on a prior
 * dispatch to THIS shop AT LEAST ONCE BEFORE today, AND has
 * dispatched a fresh RFQ to the same shop today. The query keys on
 * `guest_phone_e164` because that is the buyer identifier we always
 * have (anonymous storefront RFQs do not get a customer_profile_id
 * until OTP verification).
 *
 * Single query, no temp tables. Index used:
 *   rfq_dispatches.shop_id + rfq_requests.guest_phone_e164.
 *
 * Returns a non-negative integer.
 */
async function countReturningBuyersToday(shopId) {
  if (!shopId) return 0;
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT r_today.guest_phone_e164) AS c
       FROM rfq_dispatches d_today
       INNER JOIN rfq_requests r_today
              ON r_today.id = d_today.rfq_request_id
      WHERE d_today.shop_id = ?
        AND r_today.deleted_at IS NULL
        AND COALESCE(r_today.spam_flag, 0) = 0
        AND r_today.guest_phone_e164 IS NOT NULL
        AND d_today.created_at >= CURDATE()
        AND EXISTS (
          SELECT 1 FROM rfq_dispatches d_prior
            INNER JOIN rfq_requests r_prior
                    ON r_prior.id = d_prior.rfq_request_id
           WHERE d_prior.shop_id = d_today.shop_id
             AND d_prior.id <> d_today.id
             AND r_prior.guest_phone_e164 = r_today.guest_phone_e164
             AND d_prior.created_at < CURDATE()
             AND r_prior.deleted_at IS NULL
        )`,
    [shopId],
  );
  return Number(row?.c) || 0;
}

/**
 * Count of "hot" RFQs received today.
 *
 * A dispatch is HOT for the seller if any of the following are true:
 *   - the buyer has dispatched ≥1 prior RFQ to this shop, OR
 *   - the dispatch has buyer-side chat messages waiting for the
 *     shop's first reply.
 *
 * Mirrors `deriveRfqPriorityTier` on the frontend so the dashboard
 * pill and the inbox-row pill always agree. Single aggregate query
 * — no per-row loop.
 */
async function countHotRfqsToday(shopId) {
  if (!shopId) return 0;
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c
       FROM rfq_dispatches d
       INNER JOIN rfq_requests r ON r.id = d.rfq_request_id
      WHERE d.shop_id = ?
        AND r.deleted_at IS NULL
        AND COALESCE(r.spam_flag, 0) = 0
        AND d.created_at >= CURDATE()
        AND (
          EXISTS (
            SELECT 1 FROM rfq_dispatches d2
              INNER JOIN rfq_requests r2 ON r2.id = d2.rfq_request_id
             WHERE d2.shop_id = d.shop_id
               AND d2.id <> d.id
               AND r2.guest_phone_e164 IS NOT NULL
               AND r2.guest_phone_e164 = r.guest_phone_e164
               AND r2.deleted_at IS NULL
               AND COALESCE(r2.spam_flag, 0) = 0
          )
          OR EXISTS (
            SELECT 1 FROM rfq_conversations conv
              INNER JOIN rfq_messages m ON m.conversation_id = conv.id
             WHERE conv.dispatch_id = d.id
               AND m.deleted_at IS NULL
               AND m.sender_type = 'buyer'
          )
        )`,
    [shopId],
  );
  return Number(row?.c) || 0;
}

/**
 * Top product (by storefront product_click events) for the trailing
 * 7-day window, plus a per-product breakdown for "product interest
 * heat" chips on the seller catalogue page.
 *
 * The product_click event is emitted by the storefront card every
 * time a buyer opens a product. We don't dedupe by buyer fingerprint
 * here (deferred — see audit) because the seller signal we want is
 * "which SKU is generating the most outbound clicks", not "unique
 * buyers". Order: total clicks DESC, then product id ASC for a
 * stable tie-break.
 *
 * Returns:
 *   {
 *     top: { productId, clicks } | null,
 *     byProduct: Map<productId, clicks>,   // capped at 50 entries
 *   }
 */
async function getTopProductByClicks(shopId, days = 7) {
  if (!shopId) return { top: null, byProduct: new Map() };
  const [rows] = await pool.query(
    `SELECT
        JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.productId')) AS pid,
        COUNT(*) AS c
       FROM shop_storefront_events
      WHERE shop_id = ?
        AND event_type = 'product_click'
        AND occurred_at >= (NOW(3) - INTERVAL ? DAY)
        AND JSON_EXTRACT(metadata_json, '$.productId') IS NOT NULL
      GROUP BY pid
      ORDER BY c DESC, pid ASC
      LIMIT 50`,
    [shopId, days],
  );
  const byProduct = new Map();
  let top = null;
  for (const r of rows) {
    const idNum = Number(r.pid);
    if (!Number.isFinite(idNum)) continue;
    const clicks = Number(r.c) || 0;
    byProduct.set(idNum, clicks);
    if (!top || clicks > top.clicks) top = { productId: idNum, clicks };
  }
  return { top, byProduct };
}

/**
 * Resolve a product id → display name. Used to enrich the dashboard
 * "Sản phẩm hot" pill so the seller sees a name, not just an id.
 *
 * Safe defensive guards — returns null if the product no longer
 * exists (e.g. deleted between the click event and the dashboard
 * load).
 */
async function resolveProductName(productId) {
  if (!productId) return null;
  const [[row]] = await pool.query(
    `SELECT partName FROM products WHERE id = ? LIMIT 1`,
    [productId],
  );
  if (!row) return null;
  const raw = String(row.partName || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;
  return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
}

async function countActiveConversations(shopId, sinceDays) {
  // "Conversations that had buyer activity in the last N days".
  // A row counts when any non-deleted buyer message lives inside the
  // dispatch window — same semantics the seller sees in the inbox.
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT conv.id) AS c
       FROM rfq_conversations conv
       INNER JOIN rfq_dispatches d ON d.id = conv.dispatch_id AND d.shop_id = ?
       INNER JOIN rfq_messages m
         ON m.conversation_id = conv.id
        AND m.deleted_at IS NULL
        AND m.sender_type = 'buyer'
        AND m.created_at >= (NOW(3) - INTERVAL ? DAY)`,
    [shopId, sinceDays],
  );
  return Number(row?.c) || 0;
}

/**
 * Public entry — assemble the full metrics payload for one shop.
 *
 * All sub-queries run concurrently. The slowest of the four sets the
 * endpoint's latency floor — usually the product count on shops with
 * many SKUs (already indexed by `shopId`).
 */
export async function getShopMetricsOverview(shopId) {
  if (!shopId) throw new Error("shopId required");

  const [
    productCount,
    rfqReceivedLast30d,
    conversationsLast30d,
    eventCountsLast30d,
    // "Today" payload runs in parallel with the 30d aggregates so
    // there's no additional latency floor.
    rfqReceivedToday,
    outOfStockCount,
    eventCountsToday,
    // Sales-intelligence enrichment — also in parallel. Each runs
    // exactly one query so even on a busy shop the dashboard load
    // is sub-linear with the number of new signals.
    returningBuyersToday,
    hotRfqsToday,
    topProductPayload,
  ] = await Promise.all([
    countProducts(shopId),
    countRfqReceived(shopId, RFQ_RECEIVED_WINDOW_DAYS),
    countActiveConversations(shopId, CONVERSATIONS_ACTIVE_WINDOW_DAYS),
    countShopEventsByType(shopId, { sinceDays: 30 }),
    countRfqReceivedToday(shopId),
    countOutOfStockProducts(shopId),
    countShopEventsToday(shopId),
    countReturningBuyersToday(shopId),
    countHotRfqsToday(shopId),
    getTopProductByClicks(shopId, 7),
  ]);

  // Resolve the top-product display name after the parallel batch so
  // we don't pay the lookup latency unless there's a hit. Returns
  // null both when no clicks at all AND when the product was deleted
  // — UI treats null as "no signal" and hides the pill.
  const topProductName = topProductPayload.top
    ? await resolveProductName(topProductPayload.top.productId)
    : null;

  // Sum CTA-style event types into one number for the dashboard
  // card. Keeping the per-type breakdown alongside lets a future
  // version split the card without another round-trip.
  let ctaClicksLast30d = 0;
  for (const t of CTA_EVENT_TYPES) {
    ctaClicksLast30d += eventCountsLast30d[t] || 0;
  }
  let ctaClicksToday = 0;
  for (const t of CTA_EVENT_TYPES) {
    ctaClicksToday += eventCountsToday[t] || 0;
  }

  return {
    shopId,
    windowDays: 30,
    cards: {
      productCount,
      rfqReceivedLast30d,
      ctaClicksLast30d,
      conversationsLast30d,
    },
    // Additive operational "Today" payload — keys are intentionally
    // optional so legacy clients ignore them and the existing 30-day
    // cards keep working untouched.
    cardsToday: {
      rfqReceivedToday,
      ctaClicksToday,
      storefrontViewsToday: eventCountsToday.storefront_view || 0,
      outOfStockCount,
      // Sales-intelligence additions — UI consumers should treat any
      // unknown key as opt-in. Returning buyers = distinct phones
      // that already had a prior dispatch to this shop and came
      // back today. Hot RFQs = same-day dispatches that match the
      // HOT tier derivation. Top product = the most-clicked SKU on
      // the storefront in the last 7 days (small surface, big "AI
      // hint" feel for the seller).
      returningBuyersToday,
      hotRfqsToday,
      topProduct: topProductPayload.top
        ? {
            productId: topProductPayload.top.productId,
            clicks: topProductPayload.top.clicks,
            name: topProductName,
          }
        : null,
    },
    // Bonus payload — UI hides this today but it's there for the
    // "storefront views" placeholder card to read once we ship it.
    eventCountsLast30d,
    eventCountsToday,
    storefrontViewsLast30d: eventCountsLast30d.storefront_view || 0,
    // Per-product click breakdown for the seller catalogue page (max
    // 50 entries by design — the heat chips only need the top ~10).
    productClickHeatLast7d: Object.fromEntries(topProductPayload.byProduct),
  };
}
