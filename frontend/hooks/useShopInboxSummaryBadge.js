"use client";

import { useEffect, useState } from "react";
import axiosClient from "@/api/axiosClient";
import { API_BASE } from "@/lib/config";
import { getShopToken } from "@/lib/auth/storage";

/**
 * Lightweight polling hook for the seller-center sidebar badge.
 *
 * Reads the same `/api/shop/rfq/inbox/summary` endpoint that
 * `useShopInboxList` reads, but at a much lower frequency (60s
 * instead of 5s) because:
 *   - The sidebar is global chrome — every authenticated page
 *     mounts it. Aggressive polling would multiply the request
 *     volume by the number of open tabs.
 *   - The sidebar badge only needs "are there unread items?" not
 *     "live tail". The inbox page itself polls fast.
 *
 * Behaviour:
 *   - Returns `{ unread, loading, error }`.
 *   - `unread = unreadCount + messageUnreadTotal` — buyer signals
 *     from both dispatch state and chat messages, matching what
 *     the inbox page surfaces.
 *   - Bails (no fetch) when no token is present.
 *   - Pauses polling while the tab is hidden (`document.visibilityState`)
 *     to avoid wasted requests on backgrounded tabs.
 *   - Silently swallows network errors — a flaky badge must never
 *     surface a UI error in the global chrome.
 *
 * SSR-safe: every entry point bails when `window` is undefined.
 */
const POLL_INTERVAL_MS = 60_000;

export function useShopInboxSummaryBadge({ enabled = true } = {}) {
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    let cancelled = false;
    let timerId = null;

    async function pollOnce() {
      const token = getShopToken();
      if (!token) {
        if (!cancelled) {
          setUnread(0);
          setLoading(false);
        }
        return;
      }
      try {
        const res = await axiosClient.get("/shop/rfq/inbox/summary");
        if (cancelled) return;
        const total =
          Number(res.data?.unreadCount || 0) +
          Number(res.data?.messageUnreadTotal || 0);
        setUnread(total);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "fetch_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function startTimer() {
      stopTimer();
      if (document.visibilityState !== "visible") return;
      timerId = window.setInterval(pollOnce, POLL_INTERVAL_MS);
    }

    function stopTimer() {
      if (timerId != null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void pollOnce();
        startTimer();
      } else {
        stopTimer();
      }
    }

    void pollOnce();
    startTimer();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return { unread, loading, error };
}
