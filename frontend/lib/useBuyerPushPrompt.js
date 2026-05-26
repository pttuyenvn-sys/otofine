"use client";

import { useCallback, useEffect, useState } from "react";
import OneSignal from "react-onesignal";

import { initOneSignal } from "@/lib/onesignal";

const CLOSED_KEY = "rfq_buyer_push_prompt_closed";

async function waitForPushSubscriptionId(maxMs = 20000, stepMs = 500) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const id = OneSignal.User?.PushSubscription?.id || null;
    if (id) return id;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return null;
}

/**
 * Buyer-only push prompt — never writes to shop player_id endpoint.
 */
export function useBuyerPushPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (typeof Notification === "undefined") {
        setVisible(false);
        return;
      }
      if (Notification.permission === "granted") {
        setVisible(false);
        return;
      }
      if (Notification.permission === "denied") {
        setVisible(false);
        return;
      }
      if (typeof window !== "undefined" && window.localStorage.getItem(CLOSED_KEY) === "1") {
        setVisible(false);
        return;
      }
      setVisible(true);
    } catch {
      setVisible(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(CLOSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  const requestPermission = useCallback(async () => {
    if (busy) return null;
    setBusy(true);
    try {
      if (typeof window === "undefined") return null;
      await initOneSignal();
      await OneSignal.Notifications.requestPermission();
      const subscriptionId = await waitForPushSubscriptionId();
      if (subscriptionId) {
        try {
          window.localStorage.setItem(CLOSED_KEY, "1");
        } catch {
          /* ignore */
        }
        setVisible(false);
      }
      return subscriptionId;
    } catch (err) {
      console.warn("[RFQ buyer push] permission:", err?.message || err);
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return {
    visible,
    busy,
    dismiss,
    requestPermission,
  };
}
