"use client";

import { useCallback, useEffect, useState } from "react";
import { getShopStorefront, postShopStorefrontAction } from "@/lib/adminApi";

function btn(bg, disabled = false) {
  return {
    padding: "7px 12px",
    borderRadius: 8,
    border: "none",
    background: disabled ? "#d1d5db" : bg,
    color: "white",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 600,
  };
}

function outlineBtn(disabled = false) {
  return {
    padding: "7px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: disabled ? "#f9fafb" : "white",
    color: disabled ? "#9ca3af" : "#374151",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 600,
  };
}

/**
 * Admin storefront slug & visibility management (Phase 2).
 * Uses shops.id via shop.governanceShopId — never shop_accounts.id.
 */
export default function AdminShopStorefrontPanel({ shop, onUpdated }) {
  const shopId = shop?.governanceShopId;
  const [storefront, setStorefront] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [renameInput, setRenameInput] = useState("");
  const [error, setError] = useState("");
  const [copyMsg, setCopyMsg] = useState("");

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError("");
    try {
      const res = await getShopStorefront(shopId);
      const sf = res.data?.storefront || null;
      setStorefront(sf);
      setSlugInput(sf?.slug || "");
      setRenameInput(sf?.slug || "");
    } catch (e) {
      setStorefront(null);
      setError(e?.response?.data?.error || e.message || "Failed to load storefront");
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(action, slug) {
    if (!shopId) return;
    setSubmitting(true);
    setError("");
    setCopyMsg("");
    try {
      const body = { action };
      if (slug != null && slug !== "") body.slug = slug;
      await postShopStorefrontAction(shopId, body);
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Action failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyUrl(url) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyMsg("Đã copy URL");
      setTimeout(() => setCopyMsg(""), 2000);
    } catch {
      setCopyMsg("Không copy được — hãy copy thủ công");
    }
  }

  if (!shopId) {
    return (
      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 16 }}>
        Shop chưa có bản ghi storefront (`shops` row).
      </div>
    );
  }

  const previewSubdomain = storefront?.slug ? `https://${storefront.slug}.otofine.com` : null;
  const openUrl = previewSubdomain || storefront?.storefrontPreview?.primary || storefront?.storefrontPreview?.apex;
  const isSuspended = storefront?.publicStatus === "suspended";
  const hasSlug = Boolean(storefront?.slug);
  const enabled = storefront?.storefrontEnabled;

  return (
    <div
      style={{
        marginTop: 20,
        paddingTop: 20,
        borderTop: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Storefront management</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        Chỉ thay đổi slug / `public_status`. Trạng thái tài khoản seller không bị ảnh hưởng.
      </div>

      {loading && <div style={{ fontSize: 13, color: "#6b7280" }}>Đang tải storefront...</div>}

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {storefront && !loading && (
        <>
          <div style={{ background: "#f9fafb", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 12 }}>
            <div>
              Storefront: <strong>{enabled ? "Enabled (public)" : "Disabled / draft"}</strong>
            </div>
            <div>
              Subdomain rollout: <strong>{storefront.subdomainEnabled ? "ON" : "OFF"}</strong>
            </div>
            <div>
              Shopsite API: <strong>{storefront.shopsiteEnabled ? "ON" : "OFF"}</strong>
            </div>
            {isSuspended && (
              <div style={{ color: "#b45309", marginTop: 6 }}>
                Enforcement suspended — dùng Khôi phục SF, không bật/tắt storefront ở đây.
              </div>
            )}
          </div>

          {!hasSlug && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Tạo slug
              </label>
              <input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
                placeholder="vd: cuahang-oto-355"
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  boxSizing: "border-box",
                  marginBottom: 8,
                }}
              />
              <button
                type="button"
                disabled={submitting || !slugInput.trim()}
                style={btn("#2563eb", submitting || !slugInput.trim())}
                onClick={() => runAction("create_slug", slugInput.trim())}
              >
                {submitting ? "..." : "Create slug"}
              </button>
            </div>
          )}

          {hasSlug && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Preview</div>
                <code
                  style={{
                    display: "block",
                    fontSize: 13,
                    background: "#ecfdf5",
                    padding: "8px 10px",
                    borderRadius: 8,
                    wordBreak: "break-all",
                  }}
                >
                  {previewSubdomain}
                </code>
                {storefront.storefrontPreview?.apex && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    Apex: {storefront.storefrontPreview.apex}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {openUrl && (
                  <a
                    href={openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...outlineBtn(), textDecoration: "none", display: "inline-block" }}
                  >
                    Open storefront
                  </a>
                )}
                <button type="button" style={outlineBtn(!openUrl)} disabled={!openUrl} onClick={() => copyUrl(previewSubdomain || openUrl)}>
                  Copy URL
                </button>
                {copyMsg && <span style={{ fontSize: 12, color: "#059669", alignSelf: "center" }}>{copyMsg}</span>}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  Rename slug
                </label>
                <input
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value.toLowerCase())}
                  disabled={submitting}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                    boxSizing: "border-box",
                    marginBottom: 8,
                  }}
                />
                <button
                  type="button"
                  disabled={submitting || !renameInput.trim() || renameInput.trim() === storefront.slug}
                  style={btn("#7c3aed", submitting || !renameInput.trim() || renameInput.trim() === storefront.slug)}
                  onClick={() => runAction("rename_slug", renameInput.trim())}
                >
                  Rename
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!enabled && !isSuspended && (
                  <button
                    type="button"
                    disabled={submitting}
                    style={btn("#059669", submitting)}
                    onClick={() => {
                      if (!window.confirm("Bật storefront public cho shop này?")) return;
                      runAction("enable_storefront");
                    }}
                  >
                    Enable storefront
                  </button>
                )}
                {enabled && !isSuspended && (
                  <button
                    type="button"
                    disabled={submitting}
                    style={btn("#d97706", submitting)}
                    onClick={() => {
                      if (!window.confirm("Tắt storefront public? Slug được giữ nguyên.")) return;
                      runAction("disable_storefront");
                    }}
                  >
                    Disable storefront
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
