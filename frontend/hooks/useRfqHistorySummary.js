"use client";

import { useEffect, useState } from "react";
import { fetchHistorySummary, isHistoryAuthError } from "@/lib/rfq/rfqHistoryApi";
import { getHistoryToken, clearHistorySession } from "@/lib/rfq/rfqHistorySession";

/**
 * Lightweight history badge for entry links — only fetches when session token exists.
 */
export function useRfqHistorySummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(Boolean(getHistoryToken()));

  useEffect(() => {
    if (!getHistoryToken()) {
      setLoading(false);
      setSummary(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const data = await fetchHistorySummary();
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (!cancelled) {
          if (isHistoryAuthError(err)) clearHistorySession();
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    loading,
    hasSession: Boolean(getHistoryToken()),
    totalUnread: Number(summary?.totalUnread || 0),
    rfqCount: Number(summary?.rfqCount || 0),
    hasRecentActivity: Boolean(summary?.hasRecentActivity),
    phoneMasked: summary?.phoneMasked || null,
  };
}
