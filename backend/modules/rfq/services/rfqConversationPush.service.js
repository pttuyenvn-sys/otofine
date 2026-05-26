import { pool } from "../../../config/db.js";
import { sendPush } from "../../../services/onesignalService.js";
import * as readRepo from "../repositories/rfqConversationRead.repository.js";
import { rfqLog } from "../utils/rfqLogger.js";
import { notifyBuyerMessagePush } from "./rfqPushBuyer.service.js";
import { buildShopRfqConversationUrl } from "../utils/rfqShopDeepLink.js";

/**
 * Short window aligned with mark-read debounce (800ms) + one poll tick.
 * Longer windows caused missed pushes when tab was backgrounded but cursor still "fresh".
 */
const ACTIVE_VIEW_MS = 4_000;

function previewBody(text, attachmentCount, kind) {
  if (attachmentCount > 0) {
    const n = attachmentCount;
    const cap = text?.trim();
    if (cap) return `${cap.slice(0, 80)}${cap.length > 80 ? "…" : ""} · ${n} ảnh`;
    return n > 1 ? `Đã gửi ${n} ảnh` : "Đã gửi ảnh";
  }
  const t = String(text || "").trim();
  if (!t) return kind === "image" ? "Đã gửi ảnh" : "Tin nhắn mới";
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

function readCursorAgeMs(cursor) {
  const readAt = cursor?.last_read_at ? new Date(cursor.last_read_at).getTime() : 0;
  return readAt > 0 ? Date.now() - readAt : Number.POSITIVE_INFINITY;
}

/**
 * Suppress only when recipient read cursor already includes THIS message and read was recent.
 * Comparing against pre-insert latest (prevLatest) incorrectly suppressed new messages when
 * the buyer was caught up on the prior tail — including tab-hidden races within ACTIVE_VIEW_MS.
 */
function evaluateActiveViewSuppression(cursor, messageId) {
  if (cursor?.last_read_message_id == null) {
    return { suppressed: false, reason: null, read_age_ms: readCursorAgeMs(cursor) };
  }
  const readId = Number(cursor.last_read_message_id);
  const targetId = Number(messageId);
  if (!Number.isFinite(readId) || !Number.isFinite(targetId)) {
    return { suppressed: false, reason: null, read_age_ms: readCursorAgeMs(cursor) };
  }
  const readAgeMs = readCursorAgeMs(cursor);
  if (readId < targetId) {
    return { suppressed: false, reason: null, read_age_ms: readAgeMs };
  }
  if (readAgeMs < ACTIVE_VIEW_MS) {
    return {
      suppressed: true,
      reason: "active_view_read_includes_message",
      read_age_ms: readAgeMs,
    };
  }
  return { suppressed: false, reason: null, read_age_ms: readAgeMs };
}

function logPushAudit(fields) {
  rfqLog.info("rfq.conversation.push_audit", fields);
}

/**
 * Fire-and-forget push for conversation messages (text and/or images).
 * Skips when recipient read cursor shows active viewing (poll + mark-read).
 */
export function notifyConversationMessagePush({
  dispatchId,
  conversationId,
  rfqRequestId,
  shopId,
  messageId,
  senderType,
  messageText,
  messageType,
  attachmentCount = 0,
  prevLatestMessageId,
}) {
  void (async () => {
    const recipientType = senderType === "shop" ? "buyer" : "shop";
    const recipientShopId = recipientType === "shop" ? Number(shopId) : 0;
    const auditBase = {
      dispatch_id: dispatchId,
      conversation_id: conversationId,
      recipient_type: recipientType,
      latest_message_id: messageId,
      prev_latest_message_id: prevLatestMessageId ?? null,
      push_attempted: false,
      push_suppressed: false,
      suppression_reason: null,
      last_read_message_id: null,
      last_read_at: null,
      read_age_ms: null,
      active_view_window_ms: ACTIVE_VIEW_MS,
      subscription_found: false,
      subscription_count: 0,
      onesignal_called: false,
      onesignal_notification_id: null,
    };

    try {
      const cursor = await readRepo.findReadCursor(
        conversationId,
        recipientType,
        recipientShopId,
      );
      auditBase.last_read_message_id = cursor?.last_read_message_id ?? null;
      auditBase.last_read_at = cursor?.last_read_at ?? null;

      const suppression = evaluateActiveViewSuppression(cursor, messageId);
      auditBase.read_age_ms = suppression.read_age_ms;

      if (suppression.suppressed) {
        auditBase.push_suppressed = true;
        auditBase.suppression_reason = suppression.reason;
        logPushAudit(auditBase);
        return;
      }

      auditBase.push_attempted = true;
      const body = previewBody(messageText, attachmentCount, messageType);

      if (recipientType === "buyer") {
        const rid = Number(rfqRequestId);
        if (!Number.isFinite(rid) || rid <= 0) {
          auditBase.suppression_reason = "invalid_rfq_request_id";
          logPushAudit(auditBase);
          return;
        }

        const [subRows] = await pool.query(
          `SELECT onesignal_subscription_id FROM rfq_push_subscriptions WHERE rfq_request_id = ?`,
          [rid],
        );
        const subscriptionIds = subRows
          .map((r) => r.onesignal_subscription_id)
          .filter((id) => id != null && String(id).trim() !== "");
        auditBase.subscription_count = subscriptionIds.length;
        auditBase.subscription_found = subscriptionIds.length > 0;

        if (!subscriptionIds.length) {
          auditBase.suppression_reason = "no_buyer_subscription";
          logPushAudit(auditBase);
          return;
        }

        const [[shopRow]] = await pool.query(`SELECT name FROM shops WHERE id = ? LIMIT 1`, [
          shopId,
        ]);
        const shopName = (shopRow?.name && String(shopRow.name).trim()) || "Shop";

        const pushResult = await notifyBuyerMessagePush({
          rfqRequestId: rid,
          dispatchId,
          shopId,
          messageId,
          shopName,
          body,
        });
        auditBase.onesignal_called = Boolean(pushResult?.called ?? pushResult?.ok);
        auditBase.onesignal_notification_id = pushResult?.notificationId ?? null;
        if (!pushResult?.ok) {
          auditBase.suppression_reason = pushResult?.reason || "onesignal_failed";
        }
        logPushAudit(auditBase);
        return;
      }

      const [[shopRow]] = await pool.query(
        `SELECT onesignal_player_id, name FROM shops WHERE id = ? LIMIT 1`,
        [shopId],
      );
      const playerId = shopRow?.onesignal_player_id;
      auditBase.subscription_found = Boolean(playerId);
      auditBase.subscription_count = playerId ? 1 : 0;

      if (!playerId) {
        auditBase.suppression_reason = "no_shop_player_id";
        logPushAudit(auditBase);
        return;
      }

      auditBase.onesignal_called = true;
      await sendPush({
        playerIds: [String(playerId).trim()],
        title: "Tin nhắn từ khách",
        message: body,
        url: buildShopRfqConversationUrl(dispatchId) || undefined,
      });
      logPushAudit(auditBase);
    } catch (e) {
      auditBase.push_attempted = true;
      auditBase.suppression_reason = "exception";
      auditBase.error = String(e?.message || e);
      rfqLog.warn("rfq.conversation.push_failed", auditBase);
    }
  })();
}
