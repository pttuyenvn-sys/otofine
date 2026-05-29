"use client";

import { useCallback, useEffect, useState } from "react";
import OneSignal from "react-onesignal";
import axiosClient from "@/api/axiosClient";

import { initOneSignal } from "@/lib/onesignal";
import { API_BASE } from "@/lib/config";
import { getShopToken, getShopId, setShopId } from "@/lib/auth/storage";

const CLOSED_KEY = "onesignal_prompt_closed";

async function waitForPushSubscriptionId(
  maxMs = 20000,
  stepMs = 500
) {
  const start = Date.now();

  while (Date.now() - start < maxMs) {
    const id =
      OneSignal.User?.PushSubscription?.id ||
      OneSignal.User?.onesignalId ||
      null;

    console.log("WAIT PLAYER ID:", id);

    if (id) {
      return id;
    }

    await new Promise((r) => setTimeout(r, stepMs));
  }

  return null;
}

export function useOneSignalCustomPrompt() {
  const [visible, setVisible] = useState(false);

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

      if (
        typeof window !== "undefined" &&
        window.localStorage.getItem(CLOSED_KEY) === "1"
      ) {
        setVisible(false);
        return;
      }

      setVisible(true);
    } catch {
      setVisible(false);
    }
  }, []);

  const onAllowClick = useCallback(async () => {
    try {
      if (typeof window === "undefined") {
        return;
      }

      await initOneSignal();

      // QUAN TRỌNG:
      // dùng OneSignal API
      await OneSignal.Notifications.requestPermission();

      const playerId = await waitForPushSubscriptionId();

      console.log("FINAL PLAYER ID:", playerId);

      const token = getShopToken();

      if (playerId) {
        let shopId = getShopId();

        if ((!shopId || shopId === "null" || shopId === "undefined") && token) {
          try {
            const rs = await axiosClient.get("/shop/me");
            const sj = rs?.data;
            if (sj?.id != null) {
              const sid = String(sj.id).trim();
              if (sid) {
                shopId = sid;
                try {
                  setShopId(sid);
                } catch (_) {}
              }
            }
          } catch (_) {}
        }

        try {
          await axiosClient.post("/push/save-player-id", { playerId, shopId: shopId || null });
        } catch (e) {
          /* ignore */
        }
      }

      try {
        window.localStorage.setItem(CLOSED_KEY, "1");
      } catch (_) { }

      setVisible(false);
    } catch (err) {
      console.error("[OneSignal] onAllowClick:", err);
    }
  }, []);

  return {
    visible,
    onAllowClick,
  };
}