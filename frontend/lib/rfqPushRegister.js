import OneSignal from "react-onesignal";

import { API_BASE } from "@/lib/config";
import { initOneSignal } from "@/lib/onesignal";
import { getBuyerPushPreferences } from "@/lib/rfq/rfqPushPreferences";
import { historySessionHeaders } from "@/lib/rfq/rfqHistorySession";

function readPushSubscriptionId() {
  return OneSignal.User?.PushSubscription?.id ?? null;
}

async function postRegister(body) {
  const base = String(API_BASE || "").replace(/\/$/, "");
  const res = await fetch(`${base}/rfq-push/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

/**
 * Bind OneSignal subscription to a single RFQ after OTP verify (no JWT).
 */
export async function tryRegisterBuyerRfqPush(rfqRequestId, viewerPath) {
  try {
    const rid = Number(rfqRequestId);
    if (!Number.isFinite(rid) || rid <= 0) return false;

    if (typeof window === "undefined") return false;
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      return false;
    }

    await initOneSignal();

    const playerId = readPushSubscriptionId();
    if (!playerId) return false;

    return postRegister({
      rfqRequestId: rid,
      playerId,
      viewerPath,
      preferences: getBuyerPushPreferences(),
    });
  } catch (e) {
    console.warn("[RFQ PUSH] register failed:", e?.message || e);
    return false;
  }
}

/**
 * Register device for all phone-linked RFQs via history session.
 */
export async function tryRegisterBuyerHistoryPush(subscriptionId) {
  try {
    const playerId = String(subscriptionId || readPushSubscriptionId() || "").trim();
    if (!playerId) return false;

    const base = String(API_BASE || "").replace(/\/$/, "");
    const res = await fetch(`${base}/rfq-push/register-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...historySessionHeaders(),
      },
      body: JSON.stringify({
        playerId,
        preferences: getBuyerPushPreferences(),
      }),
    });

    if (!res.ok) {
      console.warn("[RFQ PUSH] history register HTTP", res.status);
      return false;
    }

    const data = await res.json();
    return Number(data?.registered || 0) > 0 || data?.ok === true;
  } catch (e) {
    console.warn("[RFQ PUSH] history register failed:", e?.message || e);
    return false;
  }
}

/**
 * Re-register when permission already granted (e.g. page load).
 */
export async function registerBuyerPushIfGranted({ rfqRequestId, viewerPath, historySession = false }) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return false;
  }
  if (historySession) {
    return tryRegisterBuyerHistoryPush();
  }
  return tryRegisterBuyerRfqPush(rfqRequestId, viewerPath);
}
