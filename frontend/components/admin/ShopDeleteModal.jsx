"use client";

import { useState } from "react";
import { deleteShop } from "../../api/adminApi";

/**
 * Safe soft-delete confirmation for blocked shop accounts.
 * Reuses DELETE /api/admin/shops/:id — no backend changes.
 */
export default function ShopDeleteModal({ shop, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!shop?.id) return;
    setSubmitting(true);
    setError("");

    try {
      await deleteShop(shop.id);
      onSuccess?.(shop.id);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Không thể xóa shop.");
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
      onClick={submitting ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-labelledby="shop-delete-title"
        style={{
          background: "white",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 20px 48px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 20 }}>
          <div id="shop-delete-title" style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#111827" }}>
            Xóa shop?
          </div>
          {shop?.name && (
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>
              Shop: <strong style={{ color: "#111827" }}>{shop.name}</strong>
            </div>
          )}
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 14,
              color: "#374151",
              lineHeight: 1.6,
            }}
          >
            <li>Seller account sẽ chuyển sang trạng thái deleted</li>
            <li>Shop sẽ biến mất khỏi governance list</li>
            <li>Dữ liệu sản phẩm không bị xóa vật lý</li>
            <li>Storefront có thể vẫn tồn tại nếu chưa đình chỉ</li>
          </ul>
        </div>

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
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: submitting ? "#fca5a5" : "#dc2626",
              color: "white",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {submitting ? "Đang xử lý..." : "Xác nhận xóa"}
          </button>
        </div>
      </div>
    </div>
  );
}
