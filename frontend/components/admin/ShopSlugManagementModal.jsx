"use client";

import { useEffect, useMemo, useState } from "react";
import { postShopStorefrontAction } from "@/lib/adminApi";
import {
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_RESERVED_WORDS,
  buildSlugPreviewUrls,
  normalizeSlugDraft,
  validateSlugDraft,
} from "@/lib/adminShopSlug";

/**
 * Slug governance modal — validation, preview, persistence via admin storefront API.
 */
export default function ShopSlugManagementModal({ shop, open, onClose, onSuccess }) {
  const [slugInput, setSlugInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const currentSlug = normalizeSlugDraft(shop?.slug || "");

  useEffect(() => {
    if (open) {
      setSlugInput(shop?.slug || "");
      setError("");
      setSubmitting(false);
    }
  }, [open, shop?.slug]);

  const validation = useMemo(() => validateSlugDraft(slugInput), [slugInput]);
  const preview = useMemo(() => {
    if (!validation.slug) return null;
    return buildSlugPreviewUrls(validation.slug);
  }, [validation.slug]);

  const unchanged = validation.slug === currentSlug;
  const canSave =
    validation.valid &&
    !unchanged &&
    !submitting &&
    shop?.governanceShopId != null;

  if (!open || !shop) return null;

  function handleInputChange(e) {
    setError("");
    setSlugInput(e.target.value);
  }

  async function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    setError("");

    const action = currentSlug ? "rename_slug" : "create_slug";

    try {
      await postShopStorefrontAction(shop.governanceShopId, {
        action,
        slug: validation.slug,
      });
      onSuccess?.(validation.slug);
      onClose?.();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err.message ||
        "Không thể lưu slug.";
      setError(msg);
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
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={submitting ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-labelledby="slug-mgmt-title"
        style={{
          background: "white",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 20px 48px rgba(0,0,0,0.18)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 20 }}>
          <div id="slug-mgmt-title" style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>
            Quản lý slug
          </div>
          <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>
            {shop.name ? `Shop: ${shop.name}` : `Account #${shop.id}`}
          </div>
          {shop.governanceShopId == null && (
            <div style={{ fontSize: 13, color: "#991b1b", marginTop: 8 }}>
              Shop chưa có shops.id — không thể lưu slug.
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="slug-mgmt-input"
            style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#374151" }}
          >
            Slug
          </label>
          <input
            id="slug-mgmt-input"
            type="text"
            value={slugInput}
            onChange={handleInputChange}
            placeholder="phu-tung-toyota"
            maxLength={SLUG_MAX_LENGTH + 16}
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${validation.errors.length ? "#fca5a5" : "#d1d5db"}`,
              fontSize: 14,
              fontFamily: "monospace",
              boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
            a-z, 0-9, hyphen · {SLUG_MIN_LENGTH}–{SLUG_MAX_LENGTH} ký tự · khoảng trắng → gạch ngang
          </div>
          {validation.slug && validation.slug !== slugInput.trim().toLowerCase() && (
            <div style={{ fontSize: 11, color: "#059669", marginTop: 4 }}>
              Chuẩn hóa: <code>{validation.slug}</code>
            </div>
          )}
        </div>

        {validation.errors.length > 0 && (
          <ul
            style={{
              margin: "0 0 16px",
              paddingLeft: 18,
              fontSize: 13,
              color: "#991b1b",
              lineHeight: 1.5,
            }}
          >
            {validation.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}

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

        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>Preview URL</div>
          {preview ? (
            <div style={{ fontSize: 13, lineHeight: 1.7, fontFamily: "monospace", wordBreak: "break-all" }}>
              <div>
                <span style={{ color: "#6b7280" }}>Subdomain:</span>{" "}
                <span style={{ color: "#059669" }}>{preview.subdomain}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <span style={{ color: "#6b7280" }}>Apex fallback:</span>{" "}
                <span style={{ color: "#2563eb" }}>{preview.apex}</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#9ca3af" }}>Nhập slug hợp lệ để xem preview.</div>
          )}
        </div>

        <details style={{ fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: "#374151" }}>Reserved words</summary>
          <div style={{ marginTop: 8 }}>{SLUG_RESERVED_WORDS.join(", ")}</div>
        </details>

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
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: !canSave ? "#e5e7eb" : "#7c3aed",
              color: !canSave ? "#9ca3af" : "white",
              cursor: !canSave ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {submitting ? "Đang lưu..." : "Lưu slug"}
          </button>
        </div>
      </div>
    </div>
  );
}
