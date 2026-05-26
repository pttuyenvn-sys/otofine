import { pool } from "../../../config/db.js";
import { sendBuyerQuotePush } from "../../../services/rfqPush.service.js";
import { rfqLog } from "../utils/rfqLogger.js";
import {
  recordReminderSend,
  updateReminderSendNotificationId,
} from "./rfqReminderAttribution.service.js";
import {
  buildBuyerPushDeepLinkUrl,
  buildBuyerPushDeepLinkData,
  loadRfqPublicId,
} from "../utils/rfqPushDeepLink.js";

const SITE_ORIGIN = "https://otofine.com";
const HISTORY_PATH = "/rfq/history";

const PREF_COLUMN = {
  message: "pref_messages",
  quote: "pref_quotes",
  reminder: "pref_reminders",
  status: "pref_messages",
};

/**
 * Claim dedup slot — returns false if this event was already sent.
 */
export async function claimBuyerPushSend(rfqRequestId, eventType, eventKey) {
  const rid = Number(rfqRequestId);
  if (!Number.isFinite(rid) || rid <= 0) return false;
  const type = String(eventType || "").trim();
  const key = String(eventKey || "").trim();
  if (!type || !key) return false;

  try {
    await pool.query(
      `INSERT INTO rfq_push_sent_log (rfq_request_id, event_type, event_key) VALUES (?,?,?)`,
      [rid, type, key],
    );
    return true;
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") return false;
    throw e;
  }
}

function normalizePrefs(preferences) {
  const p = preferences && typeof preferences === "object" ? preferences : {};
  return {
    messages: p.messages !== false,
    quotes: p.quotes !== false,
    reminders: p.reminders !== false,
  };
}

export async function upsertBuyerPushSubscription({
  rfqRequestId,
  subscriptionId,
  viewerPath,
  preferences,
}) {
  const rid = Number(rfqRequestId);
  const sub = String(subscriptionId || "").trim();
  if (!Number.isFinite(rid) || rid <= 0 || !sub) return false;

  const prefs = normalizePrefs(preferences);

  await pool.query(
    `
    INSERT INTO rfq_push_subscriptions (
      rfq_request_id,
      onesignal_subscription_id,
      viewer_path,
      pref_messages,
      pref_quotes,
      pref_reminders
    )
    VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      viewer_path = COALESCE(VALUES(viewer_path), viewer_path),
      pref_messages = VALUES(pref_messages),
      pref_quotes = VALUES(pref_quotes),
      pref_reminders = VALUES(pref_reminders)
    `,
    [
      rid,
      sub,
      viewerPath || null,
      prefs.messages ? 1 : 0,
      prefs.quotes ? 1 : 0,
      prefs.reminders ? 1 : 0,
    ],
  );
  return true;
}

async function loadBuyerSubscriptions(rfqRequestId, category) {
  const rid = Number(rfqRequestId);
  if (!Number.isFinite(rid) || rid <= 0) return { subscriptionIds: [], viewerPath: null };

  const prefCol = PREF_COLUMN[category] || "pref_messages";
  const allowedCols = new Set(["pref_messages", "pref_quotes", "pref_reminders"]);
  const col = allowedCols.has(prefCol) ? prefCol : "pref_messages";

  const [subRows] = await pool.query(
    `SELECT onesignal_subscription_id, viewer_path
     FROM rfq_push_subscriptions
     WHERE rfq_request_id = ? AND ${col} = 1`,
    [rid],
  );

  const subscriptionIds = subRows
    .map((r) => r.onesignal_subscription_id)
    .filter((id) => id != null && String(id).trim() !== "");

  const viewerPath =
    subRows
      .map((r) => r.viewer_path)
      .find((vp) => vp && String(vp).startsWith("/rfq/")) || null;

  return { subscriptionIds, viewerPath };
}

function resolvePushUrl(viewerPath, urlOverride, deepLink) {
  if (urlOverride && String(urlOverride).trim()) return String(urlOverride).trim();
  if (deepLink?.publicId) {
    return buildBuyerPushDeepLinkUrl(deepLink);
  }
  if (viewerPath && String(viewerPath).startsWith("/rfq/")) {
    return `${SITE_ORIGIN}${viewerPath}`;
  }
  return `${SITE_ORIGIN}${HISTORY_PATH}`;
}

function vehicleLabelFromRow(row) {
  if (!row) return null;
  let vehicle = row.vehicle_json;
  if (typeof vehicle === "string") {
    try {
      vehicle = JSON.parse(vehicle);
    } catch {
      vehicle = null;
    }
  }
  if (!vehicle || typeof vehicle !== "object") return null;
  const parts = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/**
 * Central buyer push send — prefs filter, dedup, structured audit event.
 */
export async function sendBuyerRfqPush({
  rfqRequestId,
  category,
  eventType,
  eventKey,
  headings,
  contents,
  url,
  data,
  shopName,
  skipDedup = false,
  deepLink = null,
}) {
  const rid = Number(rfqRequestId);
  if (!Number.isFinite(rid) || rid <= 0) {
    return { ok: false, reason: "invalid_rfq_request_id" };
  }

  if (!skipDedup) {
    const claimed = await claimBuyerPushSend(rid, eventType, eventKey);
    if (!claimed) {
      rfqLog.info(eventType, { rfq_request_id: rid, deduped: true, event_key: eventKey });
      return { ok: false, reason: "deduped" };
    }
  }

  const { subscriptionIds, viewerPath } = await loadBuyerSubscriptions(rid, category);
  if (!subscriptionIds.length) {
    rfqLog.info(eventType, { rfq_request_id: rid, skipped: true, reason: "no_subscription" });
    return { ok: false, reason: "no_subscription" };
  }

  const finalUrl = resolvePushUrl(viewerPath, url, deepLink);

  const pushData = {
    ...(data && typeof data === "object" ? data : {}),
    ...(deepLink?.publicId
      ? buildBuyerPushDeepLinkData({
          publicId: deepLink.publicId,
          dispatchId: deepLink.dispatchId,
          attributionId: deepLink.attributionId,
          rfqRequestId: rid,
        })
      : {}),
  };

  const pushResult = await sendBuyerQuotePush({
    subscriptionIds,
    rfqRequestId: rid,
    shopName,
    viewerPath,
    headings,
    contents,
    url: finalUrl,
    data: pushData,
  });

  rfqLog.info(eventType, {
    rfq_request_id: rid,
    event_key: eventKey,
    category,
    subscription_count: subscriptionIds.length,
    onesignal_ok: Boolean(pushResult?.ok),
    notification_id: pushResult?.notificationId ?? null,
    url: finalUrl,
  });

  return {
    ...pushResult,
    subscriptionIds,
    eventType,
    eventKey,
  };
}

export async function registerHistorySessionPush({ phoneHash, subscriptionId, preferences }) {
  const hash = String(phoneHash || "").trim();
  const sub = String(subscriptionId || "").trim();
  if (!hash || !sub) return { registered: 0 };

  const [rows] = await pool.query(
    `SELECT id FROM rfq_requests
     WHERE guest_phone_hash = ? AND deleted_at IS NULL AND status != 'pending_otp'`,
    [hash],
  );

  let registered = 0;
  for (const row of rows) {
    await upsertBuyerPushSubscription({
      rfqRequestId: row.id,
      subscriptionId: sub,
      viewerPath: HISTORY_PATH,
      preferences,
    });
    registered += 1;
  }

  rfqLog.info("rfq.push.history_registered", {
    subscription_id: sub,
    rfq_count: registered,
  });

  return { registered };
}

export async function notifyBuyerMessagePush({
  rfqRequestId,
  dispatchId,
  shopId,
  messageId,
  shopName,
  body,
}) {
  const rid = Number(rfqRequestId);
  const did = Number(dispatchId);
  const publicId = await loadRfqPublicId(rid);
  const deepLink = publicId ? { publicId, dispatchId: did, rfqRequestId: rid } : null;

  return sendBuyerRfqPush({
    rfqRequestId: rid,
    category: "message",
    eventType: "rfq.message.received",
    eventKey: `msg:${messageId}`,
    shopName,
    headings: { en: "Bạn có phản hồi mới từ cửa hàng" },
    contents: { en: body || `${shopName || "Cửa hàng"} vừa gửi tin nhắn` },
    deepLink,
  });
}

export async function notifyBuyerQuotePushEvent({ rfqRequestId, shopId, quoteId, dispatchId }) {
  const rid = Number(rfqRequestId);
  const publicId = await loadRfqPublicId(rid);
  const [[reqRow]] = await pool.query(
    `SELECT vehicle_json FROM rfq_requests WHERE id = ? LIMIT 1`,
    [rid],
  );
  const vehicle = vehicleLabelFromRow(reqRow);

  const [[shopRow]] = await pool.query(`SELECT name FROM shops WHERE id = ? LIMIT 1`, [shopId]);
  const shopName = (shopRow?.name && String(shopRow.name).trim()) || "Shop";

  const contents = vehicle
    ? { en: `Có báo giá mới cho ${vehicle}` }
    : { en: `${shopName} vừa báo giá phụ tùng của bạn` };

  return sendBuyerRfqPush({
    rfqRequestId: rid,
    category: "quote",
    eventType: "rfq.quote.received",
    eventKey: `quote:${quoteId || shopId}`,
    shopName,
    headings: { en: "Có báo giá mới" },
    contents,
    deepLink: publicId
      ? {
          publicId,
          dispatchId: dispatchId ? Number(dispatchId) : undefined,
          rfqRequestId: rid,
        }
      : null,
  });
}

export async function notifyBuyerStatusPush({ rfqRequestId, status, fromStatus }) {
  const rid = Number(rfqRequestId);
  const st = String(status || "").trim();
  if (!st) return { ok: false, reason: "no_status" };

  const copyByStatus = {
    dispatching: {
      headings: { en: "Yêu cầu đang được xử lý" },
      contents: { en: "Yêu cầu của bạn đang được gửi tới các cửa hàng" },
    },
    quoted: {
      headings: { en: "Đã có báo giá" },
      contents: { en: "Một hoặc nhiều cửa hàng đã báo giá — xem ngay" },
    },
  };

  const copy = copyByStatus[st];
  if (!copy) return { ok: false, reason: "status_not_notifiable" };

  const publicId = await loadRfqPublicId(rid);

  return sendBuyerRfqPush({
    rfqRequestId: rid,
    category: "status",
    eventType: "rfq.request.updated",
    eventKey: `status:${st}`,
    headings: copy.headings,
    contents: copy.contents,
    deepLink: publicId ? { publicId, rfqRequestId: rid } : null,
  });
}

function reminderDayKey(reminderType) {
  const day = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return `${reminderType}:${day}`;
}

/**
 * Send buyer reminder — respects pref_reminders, 24h dedup, attribution tracking.
 */
export async function sendBuyerReminderPush({
  rfqRequestId,
  reminderType,
  headings,
  contents,
  url,
  data,
}) {
  const rid = Number(rfqRequestId);
  const type = String(reminderType || "").trim();
  if (!Number.isFinite(rid) || rid <= 0 || !type) {
    return { ok: false, reason: "invalid_args" };
  }

  const eventType = `rfq.reminder.${type}`;
  const eventKey = reminderDayKey(type);
  const dedupHours = Number(process.env.RFQ_BUYER_REMINDER_DEDUP_HOURS || 24);

  const [[recent]] = await pool.query(
    `SELECT 1 AS ok FROM rfq_push_sent_log
     WHERE rfq_request_id = ? AND event_type = ?
       AND sent_at > DATE_SUB(NOW(3), INTERVAL ? HOUR)
     LIMIT 1`,
    [rid, eventType, dedupHours],
  );
  if (recent?.ok) {
    rfqLog.info(eventType, { rfq_request_id: rid, deduped: true, reason: "within_24h" });
    return { ok: false, reason: "deduped_24h" };
  }

  const { subscriptionIds, viewerPath } = await loadBuyerSubscriptions(rid, "reminder");
  if (!subscriptionIds.length) {
    rfqLog.info(eventType, { rfq_request_id: rid, skipped: true, reason: "no_subscription" });
    return { ok: false, reason: "no_subscription" };
  }

  const claimed = await claimBuyerPushSend(rid, eventType, eventKey);
  if (!claimed) {
    rfqLog.info(eventType, { rfq_request_id: rid, deduped: true, event_key: eventKey });
    return { ok: false, reason: "deduped" };
  }

  const attributionId = await recordReminderSend({
    rfqRequestId: rid,
    reminderType: type,
    subscriptionIds,
    eventType,
    eventKey,
    onesignalNotificationId: null,
  });

  const publicId =
    (data?.publicId && String(data.publicId).trim()) || (await loadRfqPublicId(rid));
  const deepLink = publicId
    ? {
        publicId,
        rfqRequestId: rid,
        attributionId,
        dispatchId: data?.dispatchId ? Number(data.dispatchId) : undefined,
      }
    : null;

  const finalUrl = resolvePushUrl(viewerPath, url, deepLink);
  const pushData = {
    ...buildBuyerPushDeepLinkData({
      publicId,
      dispatchId: deepLink?.dispatchId,
      attributionId,
      rfqRequestId: rid,
      reminderType: type,
    }),
    ...(data && typeof data === "object" ? data : {}),
  };

  const pushResult = await sendBuyerQuotePush({
    subscriptionIds,
    rfqRequestId: rid,
    viewerPath,
    headings,
    contents,
    url: finalUrl,
    data: pushData,
  });

  if (pushResult?.notificationId && attributionId) {
    await updateReminderSendNotificationId(attributionId, pushResult.notificationId);
  }

  rfqLog.info(eventType, {
    rfq_request_id: rid,
    event_key: eventKey,
    category: "reminder",
    attribution_id: attributionId,
    subscription_count: subscriptionIds.length,
    onesignal_ok: Boolean(pushResult?.ok),
    notification_id: pushResult?.notificationId ?? null,
    url: finalUrl,
  });

  return {
    ...pushResult,
    attributionId,
    subscriptionIds,
    eventType,
    eventKey,
  };
}
