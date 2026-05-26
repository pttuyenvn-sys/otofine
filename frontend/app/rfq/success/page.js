"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { API_BASE } from "@/lib/config";
import { tryRegisterBuyerRfqPush } from "@/lib/rfqPushRegister";
import {
  clearStoredViewerSession,
  getStoredViewerToken,
  saveViewerSession,
} from "@/lib/rfq/rfqViewerSession";
import { ZaloOaCardRfqSuccess } from "@/components/rfq/ZaloOaCtas";
import BuyerPushPrompt from "@/components/push/BuyerPushPrompt";
import RfqOtpInput from "@/components/rfq/RfqOtpInput";
import RfqHistoryEntryLink from "@/components/rfq/RfqHistoryEntryLink";

export default function RfqSuccessPage() {
  const [publicId, setPublicId] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState("");
  const [devHint, setDevHint] = useState("");
  const verifyInFlightRef = useRef(false);
  const lastAutoCodeRef = useRef("");

  useEffect(() => {
    setPublicId(sessionStorage.getItem("rfq_public_id") || "");
    setPhone(sessionStorage.getItem("rfq_phone") || "");
    setDevHint(sessionStorage.getItem("rfq_dev_otp") || "");
  }, []);

  const redirectToViewer = useCallback(async (tok, rfqRequestId) => {
    saveViewerSession(publicId, tok);
    sessionStorage.removeItem("rfq_dev_otp");
    const viewerPath = `/rfq/t/${tok}`;
    await tryRegisterBuyerRfqPush(rfqRequestId, viewerPath);
    window.location.href = `/rfq/t/${encodeURIComponent(tok)}`;
  }, [publicId]);

  const verifyCode = useCallback(
    async (rawCode, { source = "manual" } = {}) => {
      const normalized = String(rawCode || "").replace(/\D/g, "").slice(0, 6);
      if (normalized.length !== 6 || !publicId || !phone) return false;
      if (verifyInFlightRef.current) return false;

      if (source === "auto" && lastAutoCodeRef.current === normalized) {
        return false;
      }

      verifyInFlightRef.current = true;
      if (source === "auto") lastAutoCodeRef.current = normalized;
      setMsg("");
      setBusy(true);

      try {
        const res = await axios.post(`${API_BASE}/rfq/verify-otp`, {
          publicId,
          phone,
          code: normalized,
        });
        await redirectToViewer(res.data.viewerToken, res.data?.rfqRequestId);
        return true;
      } catch (err) {
        if (source === "auto") lastAutoCodeRef.current = "";
        setMsg(err.response?.data?.message || err.response?.data?.code || "OTP không đúng.");
        return false;
      } finally {
        verifyInFlightRef.current = false;
        setBusy(false);
      }
    },
    [publicId, phone, redirectToViewer],
  );

  useEffect(() => {
    if (!publicId || busy || restoring) return;
    const stored = getStoredViewerToken(publicId);
    if (!stored) return;

    let cancelled = false;
    setRestoring(true);

    void (async () => {
      try {
        const res = await axios.get(`${API_BASE}/rfq/by-token`, {
          headers: { "X-RFQ-Viewer-Token": stored },
        });
        if (cancelled) return;
        await redirectToViewer(stored, res.data?.rfqRequestId);
      } catch {
        if (!cancelled) clearStoredViewerSession(publicId);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicId, busy, restoring, redirectToViewer]);

  const handleOtpComplete = useCallback(
    (completed) => {
      void verifyCode(completed, { source: "auto" });
    },
    [verifyCode],
  );

  function handleSubmit(e) {
    e.preventDefault();
    void verifyCode(code, { source: "manual" });
  }

  const otpDisabled = busy || restoring || !publicId;

  return (
    <div className="card rfq-otp-page">
      <h1>Xác minh OTP</h1>
      <p className="muted rfq-otp-lead">Nhập mã OTP đã gửi qua SMS.</p>

      {restoring && (
        <p className="rfq-otp-restoring muted" aria-live="polite">
          Đang mở RFQ của bạn…
        </p>
      )}

      {devHint && (
        <div className="rfq-otp-preview">
          <span className="rfq-otp-preview__label">Mã OTP của bạn:</span>
          <strong className="rfq-otp-preview__code">{devHint}</strong>
        </div>
      )}

      <form onSubmit={handleSubmit} className="rfq-otp-form">
        <RfqOtpInput
          value={code}
          onChange={setCode}
          onComplete={handleOtpComplete}
          disabled={otpDisabled}
          invalid={Boolean(msg)}
          autoFocus={!restoring}
        />

        <button type="submit" className="rfq-otp-submit" disabled={otpDisabled || code.length < 6}>
          {busy ? "Đang xác minh…" : "Xác minh"}
        </button>
      </form>

      {msg && (
        <p className="rfq-otp-error" role="alert">
          {msg}
        </p>
      )}

      <ZaloOaCardRfqSuccess />
      <BuyerPushPrompt />

      <div className="rfq-success-history">
        <RfqHistoryEntryLink variant="secondary" source="rfq_success" />
      </div>

      <p className="muted rfq-otp-foot">
        <Link href="/rfq/new">← Quay lại form</Link>
      </p>
    </div>
  );
}
