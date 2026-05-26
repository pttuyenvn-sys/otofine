"use client";

import { useCallback, useEffect, useState } from "react";
import BuyerHistoryLogin from "@/components/rfq/BuyerHistoryLogin";
import BuyerHistoryList from "@/components/rfq/BuyerHistoryList";
import { getHistorySession, clearHistorySession } from "@/lib/rfq/rfqHistorySession";
import { fetchHistorySummary, isHistoryAuthError } from "@/lib/rfq/rfqHistoryApi";
import {
  trackRfqHistoryOpened,
  trackRfqHistorySessionRestored,
} from "@/lib/rfq/rfqHistoryAnalytics";

export default function RfqHistoryPage() {
  const [authed, setAuthed] = useState(false);
  const [booting, setBooting] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    trackRfqHistoryOpened("page");
  }, []);

  useEffect(() => {
    const session = getHistorySession();
    if (!session?.token) {
      setBooting(false);
      return undefined;
    }

    let cancelled = false;

    void (async () => {
      try {
        await fetchHistorySummary();
        if (cancelled) return;
        trackRfqHistorySessionRestored();
        setAuthed(true);
        setSessionExpired(false);
      } catch (err) {
        if (cancelled) return;
        if (isHistoryAuthError(err)) {
          clearHistorySession();
          setSessionExpired(true);
        }
        setAuthed(false);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleVerified = useCallback(() => {
    setSessionExpired(false);
    setAuthed(true);
  }, []);

  const handleLogout = useCallback(({ expired } = {}) => {
    setAuthed(false);
    setSessionExpired(Boolean(expired));
  }, []);

  if (booting) {
    return (
      <div className="card rfq-history-page">
        <p className="muted">Đang tải…</p>
      </div>
    );
  }

  if (sessionExpired && !authed) {
    return (
      <BuyerHistoryLogin
        onVerified={handleVerified}
        initialMessage="Phiên đăng nhập đã hết hạn. Nhập lại số điện thoại để xem lịch sử."
      />
    );
  }

  if (!authed) {
    return <BuyerHistoryLogin onVerified={handleVerified} />;
  }

  return <BuyerHistoryList onLogout={handleLogout} />;
}
