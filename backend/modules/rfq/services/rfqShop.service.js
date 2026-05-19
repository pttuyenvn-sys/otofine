import { pool } from "../../../config/db.js";
import { sendBuyerQuotePush } from "../../../services/rfqPush.service.js";
import * as dispatchRepo from "../repositories/rfqDispatch.repository.js";
import * as quoteRepo from "../repositories/rfqQuote.repository.js";
import * as audit from "./rfqAudit.service.js";
import { rfqLog } from "../utils/rfqLogger.js";
import { rfqCounterInc } from "./rfqObservability.service.js";

/** Fire-and-forget buyer push — never throws into quote flow */
function notifyBuyerQuotePushed(rfqRequestId, shopId) {
  void (async () => {
    try {
      const [subRows] = await pool.query(
        `SELECT onesignal_subscription_id FROM rfq_push_subscriptions WHERE rfq_request_id = ?`,
        [rfqRequestId],
      );
      const subscriptionIds = subRows
        .map((r) => r.onesignal_subscription_id)
        .filter((id) => id != null && String(id).trim() !== "");
      console.log("[RFQ PUSH] buyer subscriptions", subscriptionIds.length);

      if (!subscriptionIds.length) return;

      const [[shopRow]] = await pool.query(`SELECT name FROM shops WHERE id = ? LIMIT 1`, [
        shopId,
      ]);
      const shopName =
        (shopRow?.name && String(shopRow.name).trim()) || "Shop";

      const [[pushRow]] = await pool.query(
        `
          SELECT viewer_path
          FROM rfq_push_subscriptions
          WHERE rfq_request_id = ?
            AND viewer_path IS NOT NULL
            AND viewer_path <> ''
          ORDER BY id DESC
          LIMIT 1
          `,
        [rfqRequestId]
      );

      await sendBuyerQuotePush({
        subscriptionIds,
        rfqId: rfqRequestId,
        shopName,
        viewerPath: pushRow?.viewer_path || null,
      });
    } catch (e) {
      console.warn("[RFQ PUSH] buyer notify failed:", e?.message || e);
    }
  })();
}

export async function listInbox(shopId, query) {
  const limit = Math.min(Number(query.limit) || 24, 50);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const filter = query.filter || "all";
  const sort = query.sort || "sla";
  const items = await dispatchRepo.listInboxForShop(shopId, { limit, offset, filter, sort });
  return { items, limit, offset, filter, sort };
}

export async function inboxSummary(shopId) {
  const unread = await dispatchRepo.countInboxUnread(shopId);
  return { unreadCount: unread };
}

export async function getDispatchDetail(dispatchId, shopId) {
  const row = await dispatchRepo.findDispatchForShop(dispatchId, shopId);
  if (!row) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
  const quotes = await quoteRepo.listQuotesForShopOnRequest(row.rfq_request_id, shopId);
  return { dispatch: row, quotes };
}

export async function markDispatchViewed(dispatchId, shopId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sig = await dispatchRepo.markWebViewedTransactional(conn, dispatchId, shopId);
    if (!sig) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

    await audit.audit(conn, {
      rfq_request_id: sig.rfq_request_id,
      from_status: "dispatch",
      to_status: sig.wasFirstWebView ? "dispatch_first_view" : "dispatch_repeat_view",
      actor_type: "shop",
      actor_shop_id: shopId,
      metadata_json: { dispatchId, viewCount: sig.viewCount },
    });

    await conn.commit();

    rfqLog.metric("rfq.dispatch.view", {
      dispatch_id: dispatchId,
      shop_id: shopId,
      kind: sig.wasFirstWebView ? "first" : "repeat",
      view_count: sig.viewCount,
    });

    rfqCounterInc("dispatch_viewed");

    return { ok: true, viewCount: sig.viewCount, firstView: sig.wasFirstWebView };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

const LINE_TYPES = new Set(["unknown", "oem", "aftermarket", "used", "other"]);

export async function submitQuote(dispatchId, shopId, body) {
  const price = Number(body.priceAmount);
  if (!Number.isFinite(price) || price <= 0)
    throw Object.assign(new Error("INVALID_PRICE"), { status: 400 });

  const currency = String(body.currency || "VND").slice(0, 3).toUpperCase() || "VND";
  const note = body.note ? String(body.note).slice(0, 4000) : null;
  const lineTypeRaw = String(body.lineType || body.line_type || "unknown").toLowerCase();
  const line_type = LINE_TYPES.has(lineTypeRaw) ? lineTypeRaw : null;
  if (!line_type) throw Object.assign(new Error("INVALID_LINE_TYPE"), { status: 400 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[d]] = await conn.query(
      `SELECT * FROM rfq_dispatches WHERE id = ? AND shop_id = ? LIMIT 1 FOR UPDATE`,
      [dispatchId, shopId],
    );
    if (!d) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

    const existing = await quoteRepo.findQuoteByDispatchForUpdate(conn, dispatchId);
    if (existing) {
      await conn.commit();
      rfqLog.info("rfq.quote.idempotent", {
        dispatch_id: dispatchId,
        shop_id: shopId,
        quote_id: existing.id,
      });
      return { ok: true, idempotent: true };
    }

    try {
      await quoteRepo.insertQuote(conn, {
        rfq_request_id: d.rfq_request_id,
        dispatch_id: dispatchId,
        shop_id: shopId,
        status: "submitted",
        price_amount: price,
        currency,
        note,
        line_type,
      });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY") {
        const [[row]] = await conn.query(
          `SELECT id FROM rfq_quotes WHERE dispatch_id = ? AND deleted_at IS NULL LIMIT 1`,
          [dispatchId],
        );
        if (row) {
          await conn.commit();
          rfqLog.info("rfq.quote.idempotent_race", {
            dispatch_id: dispatchId,
            shop_id: shopId,
            quote_id: row.id,
          });
          return { ok: true, idempotent: true };
        }
      }
      throw e;
    }

    await conn.query(
      `UPDATE rfq_dispatches SET status = 'quoted', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [dispatchId],
    );

    await conn.query(
      `UPDATE rfq_requests SET status = 'quoted', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [d.rfq_request_id],
    );

    await audit.audit(conn, {
      rfq_request_id: d.rfq_request_id,
      from_status: "dispatching",
      to_status: "quoted",
      actor_type: "shop",
      actor_shop_id: shopId,
      metadata_json: { dispatchId, price, line_type },
    });

    await conn.commit();

    rfqLog.metric("rfq.quote.submitted", {
      dispatch_id: dispatchId,
      shop_id: shopId,
      rfq_request_id: d.rfq_request_id,
    });

    rfqCounterInc("quote_submitted");

    notifyBuyerQuotePushed(d.rfq_request_id, shopId);

    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
