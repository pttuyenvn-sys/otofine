import { pool } from "../config/db.js";
import {
  upsertBuyerPushSubscription,
  registerHistorySessionPush,
} from "../modules/rfq/services/rfqPushBuyer.service.js";
import {
  recordReminderOpened,
  recordReminderDismissed,
  recordReminderOptOut,
} from "../modules/rfq/services/rfqReminderAttribution.service.js";

function normalizePreferences(preferences) {
  if (!preferences || typeof preferences !== "object") return undefined;
  return {
    messages: preferences.messages !== false,
    quotes: preferences.quotes !== false,
    reminders: preferences.reminders !== false,
  };
}

/**
 * Anonymous buyer: register OneSignal subscription for an RFQ (no JWT).
 */
export async function registerBuyerPushSubscription(req, res) {
  try {
    const { rfqRequestId, playerId, viewerPath, preferences } = req.body || {};

    const rid = Number(rfqRequestId);
    if (!Number.isFinite(rid) || rid <= 0) {
      return res.status(400).json({ ok: false, message: "rfqRequestId required" });
    }

    const sub = playerId !== undefined && playerId !== null ? String(playerId).trim() : "";
    if (!sub) {
      return res.status(400).json({ ok: false, message: "playerId required" });
    }

    const [[row]] = await pool.query(
      `SELECT id FROM rfq_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [rid],
    );
    if (!row) {
      return res.status(404).json({ ok: false, message: "RFQ not found" });
    }

    const prefs = normalizePreferences(preferences);
    await upsertBuyerPushSubscription({
      rfqRequestId: rid,
      subscriptionId: sub,
      viewerPath,
      preferences: prefs,
    });

    if (prefs && prefs.reminders === false) {
      void recordReminderOptOut({ subscriptionId: sub, source: "register_single" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[rfq-push] registerBuyerPushSubscription:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Register device for all RFQs linked to buyer history session (phone hash).
 */
export async function registerBuyerPushHistorySession(req, res) {
  try {
    const { playerId, preferences } = req.body || {};
    const sub = playerId !== undefined && playerId !== null ? String(playerId).trim() : "";
    if (!sub) {
      return res.status(400).json({ ok: false, message: "playerId required" });
    }

    const session = req.rfqHistorySession;
    if (!session?.phone_hash) {
      return res.status(401).json({ ok: false, message: "Invalid history session" });
    }

    const prefs = normalizePreferences(preferences);
    const result = await registerHistorySessionPush({
      phoneHash: session.phone_hash,
      subscriptionId: sub,
      preferences: prefs,
    });

    if (prefs && prefs.reminders === false) {
      void recordReminderOptOut({ subscriptionId: sub, source: "register_history" });
    }

    return res.json({ ok: true, registered: result.registered });
  } catch (err) {
    console.error("[rfq-push] registerBuyerPushHistorySession:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Anonymous buyer reminder analytics — push open / dismiss.
 */
export async function postReminderAttributionEvent(req, res) {
  try {
    const { attributionId, event, subscriptionId, source } = req.body || {};
    const id = Number(attributionId);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "attributionId required" });
    }

    const ev = String(event || "").trim().toLowerCase();
    if (ev === "opened") {
      const result = await recordReminderOpened({
        attributionId: id,
        subscriptionId: subscriptionId ? String(subscriptionId).trim() : null,
        source: source || "api",
      });
      return res.json(result);
    }

    if (ev === "dismissed") {
      const result = await recordReminderDismissed({
        attributionId: id,
        subscriptionId: subscriptionId ? String(subscriptionId).trim() : null,
        source: source || "api",
      });
      return res.json(result);
    }

    return res.status(400).json({ ok: false, message: "event must be opened or dismissed" });
  } catch (err) {
    console.error("[rfq-push] postReminderAttributionEvent:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
