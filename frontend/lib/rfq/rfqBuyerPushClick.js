"use client";

import OneSignal from "react-onesignal";

import { initOneSignal } from "@/lib/onesignal";
import { persistDeepLinkDispatchId } from "@/lib/rfq/rfqBuyerDeepLink";
import { trackReminderAttributionEvent } from "@/lib/rfq/rfqReminderAnalytics";

let wired = false;

/**
 * Capture OneSignal notification click data before navigation (mobile may drop ?dispatchId).
 */
export function wireBuyerPushNotificationClick() {
  if (typeof window === "undefined" || wired) return;
  wired = true;

  void (async () => {
    try {
      await initOneSignal();
      OneSignal.Notifications.addEventListener("click", (event) => {
        const data = event?.notification?.additionalData || event?.notification?.data || {};
        const dispatchId = Number(data.dispatchId ?? data.dispatch_id);
        if (Number.isFinite(dispatchId) && dispatchId > 0) {
          persistDeepLinkDispatchId(dispatchId);
        }

        const attributionId = Number(data.attributionId ?? data.attribution_id);
        if (Number.isFinite(attributionId) && attributionId > 0) {
          const subscriptionId =
            OneSignal.User?.PushSubscription?.id ?? null;
          trackReminderAttributionEvent({
            attributionId,
            event: "opened",
            subscriptionId,
            source: "push_click",
          });
        }
      });
    } catch {
      /* non-fatal */
    }
  })();
}
