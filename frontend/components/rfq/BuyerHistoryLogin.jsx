"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RfqOtpInput from "@/components/rfq/RfqOtpInput";
import { requestHistoryOtp, verifyHistoryOtp } from "@/lib/rfq/rfqHistoryApi";
import { getHistoryLastPhone } from "@/lib/rfq/rfqHistorySession";

function normalizePhoneInput(raw) {
  return String(raw || "").replace(/[^\d+\s]/g, "").slice(0, 16);
}

export default function BuyerHistoryLogin({ onVerified, initialMessage = null }) {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [devHint, setDevHint] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");

  useEffect(() => {
    const stored =
      getHistoryLastPhone() ||
      (typeof window !== "undefined" ? sessionStorage.getItem("rfq_phone") : "") ||
      "";
    if (stored) setPhone(stored);
  }, []);

  async function handleRequestOtp(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const data = await requestHistoryOtp(phone);
      setPhoneMasked(data.phoneMasked || "");
      if (data.devOtpCode) setDevHint(String(data.devOtpCode));
      setStep("otp");
    } catch (err) {
      setMsg(err.response?.data?.message || err.response?.data?.code || "Không gửi được OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(rawCode) {
    const code = String(rawCode || otp).replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) return;
    setMsg("");
    setBusy(true);
    try {
      const data = await verifyHistoryOtp(phone, code);
      onVerified?.(data);
    } catch (err) {
      setMsg(err.response?.data?.message || err.response?.data?.code || "OTP không đúng.");
    } finally {
      setBusy(false);
    }
  }

  function handleOtpComplete(completed) {
    void submitOtp(completed);
  }

  if (step === "phone") {
    return (
      <div className="card rfq-otp-page rfq-history-login">
        <h1>Yêu cầu của tôi</h1>
        <p className="muted rfq-otp-lead">
          {initialMessage ||
            "Nhập số điện thoại đã dùng khi gửi yêu cầu báo giá để xem lại lịch sử."}
        </p>

        <form onSubmit={handleRequestOtp} className="rfq-otp-form">
          <label className="rfq-form-field" htmlFor="rfq-history-phone">
            <span>Số điện thoại</span>
            <input
              id="rfq-history-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0xxx xxx xxx"
              value={phone}
              onChange={(e) => setPhone(normalizePhoneInput(e.target.value))}
              disabled={busy}
              required
            />
          </label>

          <button type="submit" className="rfq-otp-submit" disabled={busy || phone.trim().length < 9}>
            {busy ? "Đang gửi…" : "Nhận mã OTP"}
          </button>
        </form>

        {msg ? (
          <p className="rfq-otp-error" role="alert">
            {msg}
          </p>
        ) : null}

        <p className="muted rfq-otp-foot">
          <Link href="/rfq/new">+ Tạo yêu cầu mới</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card rfq-otp-page rfq-history-login">
      <h1>Xác minh OTP</h1>
      <p className="muted rfq-otp-lead">
        Nhập mã OTP gửi tới {phoneMasked || "số điện thoại của bạn"}.
      </p>

      {devHint ? (
        <div className="rfq-otp-preview">
          <span className="rfq-otp-preview__label">Mã OTP (dev):</span>
          <strong className="rfq-otp-preview__code">{devHint}</strong>
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitOtp(otp);
        }}
        className="rfq-otp-form"
      >
        <RfqOtpInput
          value={otp}
          onChange={setOtp}
          onComplete={handleOtpComplete}
          disabled={busy}
          invalid={Boolean(msg)}
          autoFocus
        />

        <button type="submit" className="rfq-otp-submit" disabled={busy || otp.length < 6}>
          {busy ? "Đang xác minh…" : "Xem lịch sử"}
        </button>
      </form>

      {msg ? (
        <p className="rfq-otp-error" role="alert">
          {msg}
        </p>
      ) : null}

      <p className="muted rfq-otp-foot">
        <button type="button" className="rfq-history-logout" onClick={() => setStep("phone")} disabled={busy}>
          ← Đổi số điện thoại
        </button>
      </p>
    </div>
  );
}
