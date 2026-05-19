"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { API_BASE } from "@/lib/config";
import { tryRegisterBuyerRfqPush } from "@/lib/rfqPushRegister";
import { ZaloOaCardRfqSuccess } from "@/components/rfq/ZaloOaCtas";
import BuyerPushPrompt from "@/components/push/BuyerPushPrompt";

export default function RfqSuccessPage() {
  const [publicId, setPublicId] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [devHint, setDevHint] = useState("");

  useEffect(() => {
    setPublicId(sessionStorage.getItem("rfq_public_id") || "");
    setPhone(sessionStorage.getItem("rfq_phone") || "");
    setDevHint(sessionStorage.getItem("rfq_dev_otp") || "");
  }, []);

  async function verify(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const res = await axios.post(`${API_BASE}/rfq/verify-otp`, {
        publicId,
        phone,
        code,
      });
      const tok = res.data.viewerToken;
      sessionStorage.setItem("rfq_viewer_token", tok);
      sessionStorage.removeItem("rfq_dev_otp");

      const viewerPath = `/rfq/t/${res.data.viewerToken}`;
      await tryRegisterBuyerRfqPush(
        res.data?.rfqRequestId,
        viewerPath
      );
      window.location.href = `/rfq/t/${encodeURIComponent(tok)}`;
    } catch (err) {
      setMsg(err.response?.data?.message || err.response?.data?.code || "OTP không đúng.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1>Xác minh OTP</h1>
      <p className="muted">
        RFQ <strong>{publicId || "—"}</strong>. Nhập mã OTP đã gửi (console server / SMS sau).
      </p>
      {devHint && (
        <p style={{ background: "#fef9c3", padding: "0.75rem", borderRadius: 8 }}>
          Dev OTP: <strong>{devHint}</strong>
        </p>
      )}

      <ZaloOaCardRfqSuccess />
      <BuyerPushPrompt />
      <form onSubmit={verify} style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
        <div>
          <label>Mã OTP</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <button type="submit" disabled={busy || !publicId}>
          {busy ? "Đang xác minh…" : "Xác minh"}
        </button>
      </form>
      {msg && <p style={{ color: "#b91c1c", marginTop: "1rem" }}>{msg}</p>}
      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link href="/rfq/new">← Quay lại form</Link>
      </p>
    </div>
  );
}
