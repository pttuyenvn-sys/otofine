"use client";

import { resolveStorefrontDomainPreview } from "@/lib/adminShopSlug";

const publicStatusLabel = {
  pending: "Nháp",
  public: "Công khai",
  suspended: "Đình chỉ",
};

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN");
}

/**
 * Read-only storefront domain summary for admin drawer.
 */
export default function StorefrontDomainSection({
  shop,
  storefront,
  storefrontStatus,
  slugHistory = [],
  lastSlugUpdate,
  onManageSlug,
}) {
  const merged = {
    slug: shop?.slug,
    storefrontPreview: shop?.storefrontPreview,
    storefront,
  };
  const preview = resolveStorefrontDomainPreview(merged);
  const status = storefrontStatus || storefront?.publicStatus || shop?.shopPublicStatus || null;

  return (
    <div
      style={{
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Storefront Domain
        </div>
        {onManageSlug && (
          <button
            type="button"
            onClick={onManageSlug}
            style={{
              padding: "5px 10px",
              borderRadius: 8,
              border: "1px solid #7c3aed",
              background: "white",
              color: "#6d28d9",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Quản lý slug
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", fontSize: 13 }}>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>Current slug</div>
          <code style={{ display: "block", marginTop: 4, fontSize: 13 }}>{preview.slug || "—"}</code>
        </div>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>Storefront status</div>
          <div style={{ marginTop: 4, fontWeight: 600 }}>{publicStatusLabel[status] || status || "—"}</div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ color: "#6b7280", fontSize: 11 }}>Subdomain preview</div>
          <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>
            {preview.subdomain || "—"}
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ color: "#6b7280", fontSize: 11 }}>Apex fallback URL</div>
          <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>
            {preview.apex || "—"}
          </div>
        </div>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>Slug locked</div>
          <div style={{ marginTop: 4 }}>No</div>
        </div>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>Last slug update</div>
          <div style={{ marginTop: 4 }}>{formatDate(lastSlugUpdate)}</div>
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" }}>
          Slug history
        </div>
        {slugHistory.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9ca3af" }}>Chưa có lịch sử đổi slug.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
            {slugHistory.slice(0, 8).map((entry) => (
              <li key={entry.id}>
                {entry.subtitle || entry.title} · {formatDate(entry.occurredAt)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
