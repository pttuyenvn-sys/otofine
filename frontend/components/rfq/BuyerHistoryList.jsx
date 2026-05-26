"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/lib/config";
import BuyerHistoryCard from "@/components/rfq/BuyerHistoryCard";
import BuyerPushPrompt from "@/components/push/BuyerPushPrompt";
import BuyerPushPreferences from "@/components/push/BuyerPushPreferences";
import {
  fetchHistoryRequests,
  isHistoryAuthError,
  logoutHistorySession,
  openHistoryRequest,
} from "@/lib/rfq/rfqHistoryApi";
import { getStoredViewerToken, saveViewerSession } from "@/lib/rfq/rfqViewerSession";
import { getHistorySession } from "@/lib/rfq/rfqHistorySession";
import { trackRfqHistoryReopened } from "@/lib/rfq/rfqHistoryAnalytics";
import { tryRegisterBuyerHistoryPush, registerBuyerPushIfGranted } from "@/lib/rfqPushRegister";

export default function BuyerHistoryList({ onLogout }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [phoneMasked, setPhoneMasked] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [openingId, setOpeningId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const data = await fetchHistoryRequests();
      setItems(Array.isArray(data.items) ? data.items : []);
      setSummary(data.summary || null);
      setPhoneMasked(data.phoneMasked || getHistorySession()?.phoneMasked || "");
      setSessionExpired(false);
    } catch (err) {
      if (isHistoryAuthError(err)) {
        setSessionExpired(true);
        onLogout?.({ expired: true });
        return;
      }
      setMsg(err.response?.data?.message || "Không tải được lịch sử.");
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    void load();
    void registerBuyerPushIfGranted({ historySession: true });
  }, [load]);

  async function handlePushSubscribed() {
    await tryRegisterBuyerHistoryPush();
  }

  async function handleOpen(item) {
    const publicId = item?.publicId;
    if (!publicId || openingId) return;

    setOpeningId(publicId);
    setMsg("");

    try {
      const stored = getStoredViewerToken(publicId);
      if (stored) {
        try {
          await axios.get(`${API_BASE}/rfq/by-token`, {
            headers: { "X-RFQ-Viewer-Token": stored },
          });
          trackRfqHistoryReopened(publicId);
          window.location.href = `/rfq/t/${encodeURIComponent(stored)}`;
          return;
        } catch {
          /* fall through — mint new viewer token */
        }
      }

      const data = await openHistoryRequest(publicId);
      if (!data?.viewerToken) throw new Error("NO_VIEWER_TOKEN");
      trackRfqHistoryReopened(publicId);
      saveViewerSession(publicId, data.viewerToken);
      window.location.href = `/rfq/t/${encodeURIComponent(data.viewerToken)}`;
    } catch (err) {
      setMsg(err.response?.data?.message || err.message || "Không mở được yêu cầu.");
      setOpeningId("");
    }
  }

  async function handleLogout() {
    await logoutHistorySession();
    onLogout?.();
  }

  if (sessionExpired) {
    return (
      <div className="card rfq-history-page">
        <p className="rfq-form-msg rfq-form-msg--error" role="alert">
          Phiên đăng nhập đã hết hạn.
        </p>
        <button type="button" className="rfq-otp-submit" onClick={() => onLogout?.({ expired: true })}>
          Đăng nhập lại
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card rfq-history-page">
        <p className="muted">Đang tải lịch sử…</p>
      </div>
    );
  }

  return (
    <div className="rfq-history-page-shell">
      <div className="card rfq-history-page">
        <BuyerPushPrompt onSubscribed={handlePushSubscribed} compact />
        <header className="rfq-history-page__head">
          <div>
            <h1>Yêu cầu của tôi</h1>
            {phoneMasked ? <p className="muted rfq-history-page__phone">{phoneMasked}</p> : null}
            {summary?.totalUnread > 0 ? (
              <p className="rfq-history-page__unread" role="status">
                {summary.totalUnread} tin nhắn chưa đọc
              </p>
            ) : summary?.hasRecentActivity ? (
              <p className="rfq-history-page__activity muted" role="status">
                Có hoạt động gần đây
              </p>
            ) : null}
          </div>
          <div className="rfq-history-page__head-actions">
            <a href="/rfq/new" className="rfq-history-page__new-link">
              + Tạo hỏi giá mới
            </a>
            <button type="button" className="rfq-history-logout" onClick={() => void handleLogout()}>
              Đăng xuất
            </button>
          </div>
        </header>

        <BuyerPushPreferences />

        {msg ? (
          <p className="rfq-form-msg rfq-form-msg--error" role="alert">
            {msg}
          </p>
        ) : null}

        {!items.length ? (
          <div className="rfq-shop-buyer-list__empty rfq-history-empty">
            <p>Chưa có yêu cầu nào với số điện thoại này.</p>
            <a href="/rfq/new" className="rfq-otp-submit rfq-history-empty__cta">
              Tạo yêu cầu mới
            </a>
          </div>
        ) : (
          <div className="rfq-shop-buyer-list rfq-shop-buyer-list--page rfq-history-list">
            {items.map((item) => (
              <BuyerHistoryCard
                key={item.publicId}
                item={item}
                onOpen={handleOpen}
                opening={openingId === item.publicId}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rfq-history-new-cta">
        <a href="/rfq/new" className="rfq-otp-submit rfq-history-new-cta__btn">
          + Tạo hỏi giá mới
        </a>
      </div>
    </div>
  );
}
