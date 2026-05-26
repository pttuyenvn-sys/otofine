import { pool } from "../../../config/db.js";
import { rfqLog } from "../utils/rfqLogger.js";
import { rfqCounterInc } from "./rfqObservability.service.js";
import * as attrRepo from "../repositories/rfqReminderAttribution.repository.js";

function pct(n, d) {
  if (!d || d <= 0) return null;
  return Math.round((10000 * Number(n || 0)) / d) / 100;
}

export async function recordReminderSend({
  rfqRequestId,
  reminderType,
  subscriptionIds,
  eventType,
  eventKey,
  onesignalNotificationId,
}) {
  const rid = Number(rfqRequestId);
  if (!Number.isFinite(rid) || rid <= 0) return null;

  const [[reqRow]] = await pool.query(
    `SELECT guest_phone_hash FROM rfq_requests WHERE id = ? LIMIT 1`,
    [rid],
  );

  const sendId = await attrRepo.insertReminderSend({
    rfq_request_id: rid,
    reminder_type: reminderType,
    phone_hash: reqRow?.guest_phone_hash || null,
    subscription_ids: subscriptionIds,
    sent_log_event_type: eventType,
    sent_log_event_key: eventKey,
    onesignal_notification_id: onesignalNotificationId || null,
  });

  rfqLog.info("rfq.reminder.sent", {
    attribution_id: sendId,
    rfq_request_id: rid,
    reminder_type: reminderType,
    subscription_count: subscriptionIds?.length || 0,
    phone_hash: reqRow?.guest_phone_hash || null,
  });

  return sendId;
}

export async function updateReminderSendNotificationId(sendId, notificationId) {
  await attrRepo.updateReminderSendNotificationId(sendId, notificationId);
}

export async function recordReminderOpened({
  attributionId,
  subscriptionId = null,
  source = "push_click",
}) {
  const send = await attrRepo.findReminderSendById(attributionId);
  if (!send) return { ok: false, reason: "not_found" };

  const { inserted } = await attrRepo.insertOutcomeIgnoreDuplicate({
    sendId: send.id,
    outcome: "opened",
    subscriptionId,
    metadata: { source },
  });

  if (inserted) {
    rfqCounterInc("buyer_reminder_opened");
    rfqLog.info("rfq.reminder.opened", {
      attribution_id: send.id,
      rfq_request_id: send.rfq_request_id,
      reminder_type: send.reminder_type,
      source,
      subscription_id: subscriptionId || null,
    });
  }

  return { ok: true, inserted };
}

export async function recordReminderDismissed({
  attributionId = null,
  rfqRequestId = null,
  subscriptionId = null,
  source = "ui",
}) {
  let send = null;
  if (attributionId) {
    send = await attrRepo.findReminderSendById(attributionId);
  } else if (rfqRequestId) {
    send = await attrRepo.findAttributableSendForRfq(rfqRequestId);
  }

  if (!send) return { ok: false, reason: "no_attributable_send" };

  const { inserted } = await attrRepo.insertOutcomeIgnoreDuplicate({
    sendId: send.id,
    outcome: "dismissed",
    subscriptionId,
    metadata: { source },
  });

  if (inserted) {
    rfqLog.info("rfq.reminder.dismissed", {
      attribution_id: send.id,
      rfq_request_id: send.rfq_request_id,
      reminder_type: send.reminder_type,
      source,
    });
  }

  return { ok: true, inserted };
}

export async function recordReminderOptOut({ subscriptionId, source = "prefs" }) {
  const sends = await attrRepo.findRecentSendsForSubscription(subscriptionId);
  let marked = 0;

  for (const send of sends) {
    const { inserted } = await attrRepo.insertOutcomeIgnoreDuplicate({
      sendId: send.id,
      outcome: "opt_out",
      subscriptionId,
      metadata: { source },
    });
    if (inserted) marked += 1;
  }

  if (marked > 0) {
    rfqCounterInc("buyer_reminder_opt_out");
    rfqLog.info("rfq.reminder.opt_out", {
      subscription_id: subscriptionId,
      source,
      attributed_sends: marked,
    });
  }

  return { ok: true, marked };
}

/**
 * Attribute buyer comeback within attribution window — idempotent per send + kind.
 */
export async function tryAttributeReminderConversion(rfqRequestId, conversionKind, meta = {}) {
  const rid = Number(rfqRequestId);
  const kind = String(conversionKind || "").trim();
  if (!Number.isFinite(rid) || rid <= 0 || !kind) {
    return { ok: false, reason: "invalid_args" };
  }

  const send = await attrRepo.findAttributableSendForRfq(rid);
  if (!send) return { ok: false, reason: "no_attributable_send" };

  const { inserted } = await attrRepo.insertOutcomeIgnoreDuplicate({
    sendId: send.id,
    outcome: "converted",
    conversionKind: kind,
    metadata: meta,
  });

  if (inserted) {
    rfqCounterInc(`buyer_reminder_converted_${kind}`);
    rfqLog.info("rfq.reminder.converted", {
      attribution_id: send.id,
      rfq_request_id: rid,
      reminder_type: send.reminder_type,
      conversion_kind: kind,
      ...meta,
    });
  }

  return { ok: true, inserted, attribution_id: send.id };
}

export async function getReminderMetrics(days = 7) {
  const raw = await attrRepo.aggregateReminderMetrics(days);
  const sends = Number(raw.totals?.sends || 0);
  const opens = Number(raw.totals?.opens || 0);
  const converted = Number(raw.totals?.converted_any || 0);
  const optOut = Number(raw.totals?.opt_out || 0);

  const byType = (raw.by_type || []).map((row) => {
    const s = Number(row.sends || 0);
    const o = Number(row.opens || 0);
    const c = Number(row.converted_any || 0);
    const opt = Number(row.opt_out || 0);
    return {
      reminder_type: row.reminder_type,
      sends: s,
      opens: o,
      reopen: Number(row.reopen || 0),
      quote_view: Number(row.quote_view || 0),
      buyer_message: Number(row.buyer_message || 0),
      converted_any: c,
      dismissed: Number(row.dismissed || 0),
      opt_out: opt,
      open_rate_pct: pct(o, s),
      conversion_rate_pct: pct(c, s),
      opt_out_rate_pct: pct(opt, s),
    };
  });

  return {
    window_days: raw.days,
    attribution_window_hours: attrRepo.attributionWindowHours(),
    totals: {
      sends,
      opens,
      converted_any: converted,
      opt_out: optOut,
      open_rate_pct: pct(opens, sends),
      conversion_rate_pct: pct(converted, sends),
      opt_out_rate_pct: pct(optOut, sends),
    },
    by_type: byType,
    spam_risk: {
      opt_out_rate_pct: pct(optOut, sends),
      flag_high_opt_out: pct(optOut, sends) != null && pct(optOut, sends) > 5,
    },
  };
}
