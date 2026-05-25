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
  ] = await Promise.all([
    countProducts(shopId),
    countRfqReceived(shopId, RFQ_RECEIVED_WINDOW_DAYS),
    countActiveConversations(shopId, CONVERSATIONS_ACTIVE_WINDOW_DAYS),
    countShopEventsByType(shopId, { sinceDays: 30 }),
    countRfqReceivedToday(shopId),
    countOutOfStockProducts(shopId),
    countShopEventsToday(shopId),
  ]);

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
    },
    // Bonus payload — UI hides this today but it's there for the
    // "storefront views" placeholder card to read once we ship it.
    eventCountsLast30d,
    eventCountsToday,
    storefrontViewsLast30d: eventCountsLast30d.storefront_view || 0,
  };
}
