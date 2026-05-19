import OneSignal from "react-onesignal";

import { API_BASE } from "@/lib/config";
import { initOneSignal } from "@/lib/onesignal";

/**
 * Bind OneSignal subscription to RFQ after OTP verify (no JWT).
 */
export async function tryRegisterBuyerRfqPush(
  rfqRequestId,
  viewerPath
) {
  try {
    const rid = Number(rfqRequestId);
    if (!Number.isFinite(rid) || rid <= 0) return;

    if (typeof window === "undefined") return;

    await initOneSignal();

    const playerId = OneSignal.User?.PushSubscription?.id ?? null;
    if (!playerId) return;

    console.log("RFQ PUSH REGISTER:", {
      rfqRequestId: rid,
      playerId,
    });

    const base = String(API_BASE || "").replace(/\/$/, "");
    const res = await fetch(`${base}/rfq-push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rfqRequestId: rid,
        playerId,
        viewerPath,
      }),
    });

    if (!res.ok) {
      console.warn("[RFQ PUSH] register HTTP", res.status);
      return;
    }

    console.log("RFQ PUSH REGISTERED");
  } catch (e) {
    console.warn("[RFQ PUSH] register failed:", e?.message || e);
  }
}
