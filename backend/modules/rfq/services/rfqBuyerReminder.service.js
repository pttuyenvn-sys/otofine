import { rfqLog } from "../utils/rfqLogger.js";
import { rfqCounterInc } from "./rfqObservability.service.js";
import { sendBuyerReminderPush } from "./rfqPushBuyer.service.js";
import * as reminderRepo from "../repositories/rfqBuyerReminder.repository.js";

const REMINDER_PRIORITY = ["unread_messages", "quote_unseen", "inactive"];

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

function reminderCopy(type, row) {
  const vehicle = vehicleLabelFromRow(row);
  switch (type) {
    case "inactive":
      return {
        headings: { en: "Bạn vẫn đang tìm phụ tùng?" },
        contents: vehicle
          ? { en: `Yêu cầu ${vehicle} vẫn đang chờ — xem cập nhật từ cửa hàng` }
          : { en: "Yêu cầu của bạn vẫn đang chờ — xem cập nhật từ cửa hàng" },
      };
    case "quote_unseen":
      return {
        headings: { en: "Bạn có báo giá chưa xem" },
        contents: vehicle
          ? { en: `Có báo giá mới cho ${vehicle} — mở để so sánh giá` }
          : { en: "Có báo giá mới cho yêu cầu của bạn — mở để xem" },
      };
    case "unread_messages":
      return {
        headings: { en: "Bạn có phản hồi mới chưa đọc" },
        contents: vehicle
          ? { en: `Cửa hàng đã phản hồi về ${vehicle} — xem tin nhắn ngay` }
          : { en: "Cửa hàng đã phản hồi yêu cầu của bạn — xem tin nhắn ngay" },
      };
    default:
      return {
        headings: { en: "Cập nhật yêu cầu hỏi giá" },
        contents: { en: "Xem lại yêu cầu của bạn trên Otofine" },
      };
  }
}

async function trySendReminder(type, row, { dryRun = false } = {}) {
  const rfqRequestId = Number(row?.rfq_request_id);
  if (!Number.isFinite(rfqRequestId) || rfqRequestId <= 0) {
    return { type, rfq_request_id: rfqRequestId, ok: false, reason: "invalid_id" };
  }

  const eventType = `rfq.reminder.${type}`;
  const dedupHours = Number(process.env.RFQ_BUYER_REMINDER_DEDUP_HOURS || 24);

  if (await reminderRepo.wasReminderSentWithinHours(rfqRequestId, eventType, dedupHours)) {
    return { type, rfq_request_id: rfqRequestId, ok: false, reason: "deduped_24h" };
  }

  if (dryRun) {
    rfqLog.info("rfq.reminder.dry_run", { type, rfq_request_id: rfqRequestId });
    return { type, rfq_request_id: rfqRequestId, ok: true, dry_run: true };
  }

  const copy = reminderCopy(type, row);
  const result = await sendBuyerReminderPush({
    rfqRequestId,
    reminderType: type,
    headings: copy.headings,
    contents: copy.contents,
    data: { reminderType: type, publicId: row.public_id || null },
  });

  if (result?.ok) {
    rfqCounterInc(`buyer_reminder_${type}_sent`);
  }

  return {
    type,
    rfq_request_id: rfqRequestId,
    ok: Boolean(result?.ok),
    reason: result?.reason || null,
  };
}

/**
 * Pick at most one reminder per RFQ — highest signal wins.
 */
function mergeCandidates(groups) {
  const byRfq = new Map();

  for (const type of REMINDER_PRIORITY) {
    const rows = groups[type] || [];
    for (const row of rows) {
      const id = Number(row.rfq_request_id);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!byRfq.has(id)) {
        byRfq.set(id, { type, row });
      }
    }
  }

  return [...byRfq.values()];
}

export async function runBuyerReminderTick({ dryRun = false } = {}) {
  const inactiveHours = Math.max(1, Number(process.env.RFQ_BUYER_REMINDER_INACTIVE_HOURS || 6));
  const quoteHours = Math.max(1, Number(process.env.RFQ_BUYER_REMINDER_QUOTE_HOURS || 1));
  const unreadMinutes = Math.max(15, Number(process.env.RFQ_BUYER_REMINDER_UNREAD_MIN || 30));

  const [inactive, quoteUnseen, unreadMessages] = await Promise.all([
    reminderRepo.listInactiveAfterCreationCandidates(inactiveHours),
    reminderRepo.listUnseenQuoteCandidates(quoteHours),
    reminderRepo.listUnreadMessageCandidates(unreadMinutes),
  ]);

  const merged = mergeCandidates({
    unread_messages: unreadMessages,
    quote_unseen: quoteUnseen,
    inactive,
  });

  const summary = {
    scanned: {
      inactive: inactive.length,
      quote_unseen: quoteUnseen.length,
      unread_messages: unreadMessages.length,
      merged: merged.length,
    },
    sent: 0,
    skipped: 0,
    results: [],
  };

  for (const { type, row } of merged) {
    const outcome = await trySendReminder(type, row, { dryRun });
    summary.results.push(outcome);
    if (outcome.ok) summary.sent += 1;
    else summary.skipped += 1;
  }

  rfqLog.info("rfq.reminder.tick_completed", {
    dry_run: dryRun,
    ...summary.scanned,
    sent: summary.sent,
    skipped: summary.skipped,
  });

  return summary;
}
