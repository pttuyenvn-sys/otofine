"use client";

import { useState } from "react";
import { createEnforcementCase, suspendShopOnCase } from "@/lib/adminApi";

/**
 * Governance suspension modal — Slice 7.
 *
 * Props:
 *   target  { shopId: number, shopName: string }
 *   onClose () => void
 *   onSuccess () => void   — called after a successful suspension or alreadySuspended
 *
 * Timing: sends duration_days (semantic) to backend.
 * Backend (enforcement.admin.controller.js) computes expires_at server-side.
 * No Date arithmetic is performed in the frontend.
 *
 * Two-step API flow:
 *   1. POST /admin/enforcement/cases          → { caseId }
 *   2. POST /admin/enforcement/cases/:id/suspend → { suspensionId } | { alreadySuspended }
 *
 * If step 1 succeeds but step 2 fails, an open orphan case is left.
 * Admin can close it from the Enforcement Cases page (acceptable MVP trade-off).
 */
export default function ShopSuspendModal({ target, onClose, onSuccess }) {
  const [reason, setReason] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const daysNum = Number(durationDays);
  const isTemporary = durationDays !== "" && daysNum > 0;
  const suspensionType = isTemporary ? "temporary" : "permanent";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Lý do đình chỉ là bắt buộc.");
      return;
    }
    if (durationDays !== "" && (isNaN(daysNum) || daysNum < 1 || daysNum > 3650)) {
      setError("Thời gian phải từ 1 đến 3650 ngày, hoặc để trống để đình chỉ vĩnh viễn.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Step 1 — Create enforcement case
      const caseRes = await createEnforcementCase({
        target_type: "shop",
        target_id: target.shopId,
        case_type: "suspension",
        severity: "medium",
        summary: reason.trim(),
      });

      const caseId = caseRes.data?.caseId;
      if (!caseId) {
        throw new Error("Không tạo được enforcement case — phản hồi thiếu caseId.");
      }

      // Step 2 — Execute suspension
      // duration_days is sent as a semantic value; backend computes expires_at.
      // Never send a pre-computed timestamp from the frontend.
      const suspendBody = {
        shopId: target.shopId,
        reason: reason.trim(),
        suspension_type: suspensionType,
        suspend_login: true,
        ...(isTemporary ? { duration_days: daysNum } : {}),
      };

      const suspendRes = await suspendShopOnCase(caseId, suspendBody);

      // alreadySuspended is a valid success path — shop is already in suspension state.
      // The backend responded 200 without writing a new record.
      if (suspendRes.data?.alreadySuspended) {
        console.info("[ShopSuspendModal] alreadySuspended — shop was already under suspension.");
      }

      onSuccess();
    } catch (err) {
      const httpStatus = err?.response?.status;
      if (httpStatus === 404) {
        setError(
          "Tính năng quản trị chưa được kích hoạt (ADMIN_MODERATION_ENABLED). Liên hệ quản trị viên hệ thống.",
        );
      } else if (httpStatus === 400) {
        setError(err?.response?.data?.error || "Yêu cầu không hợp lệ.");
      } else if (httpStatus === 409) {
        setError(err?.response?.data?.error || "Xung đột trạng thái — vui lòng tải lại trang.");
      } else {
        setError(err?.response?.data?.error || err.message || "Đã xảy ra lỗi không xác định.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 20px 48px rgba(0,0,0,0.18)",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            Governance Suspension
          </div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            Shop:{" "}
            <strong style={{ color: "#111827" }}>{target.shopName || `ID ${target.shopId}`}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Reason */}
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="suspend-reason"
              style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#374151" }}
            >
              Lý do đình chỉ <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <textarea
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mô tả lý do đình chỉ shop này..."
              rows={3}
              disabled={submitting}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
                color: "#111827",
              }}
            />
          </div>

          {/* Duration */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="suspend-duration"
              style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#374151" }}
            >
              Thời gian (ngày) — để trống = đình chỉ vĩnh viễn
            </label>
            <input
              id="suspend-duration"
              type="number"
              min="1"
              max="3650"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              placeholder="Ví dụ: 30"
              disabled={submitting}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
                boxSizing: "border-box",
                color: "#111827",
              }}
            />
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              {isTemporary
                ? `Tạm thời — ${daysNum} ngày. Backend tính thời điểm hết hạn.`
                : "Vĩnh viễn — không tự động hết hạn."}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 16,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "white",
                cursor: submitting ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 14,
                color: "#374151",
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                background: submitting || !reason.trim() ? "#fca5a5" : "#dc2626",
                color: "white",
                cursor: submitting || !reason.trim() ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {submitting ? "Đang xử lý..." : "Xác nhận đình chỉ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
