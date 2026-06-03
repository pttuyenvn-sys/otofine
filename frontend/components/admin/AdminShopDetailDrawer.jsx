"use client";

import { useCallback, useEffect, useState } from "react";
import { getShopDetail } from "../../api/adminApi";
import AdminShopStorefrontPanel from "@/components/admin/AdminShopStorefrontPanel";
import AdminStorefrontModerationActions from "@/components/admin/AdminStorefrontModerationActions";
import StorefrontDomainSection from "@/components/admin/StorefrontDomainSection";
import ShopSlugManagementModal from "@/components/admin/ShopSlugManagementModal";
import { FLAG_LABELS_SHORT, healthLabelText, healthTone } from "@/lib/adminShopHealth";
import {
  CONTACT_DRIFT_LABELS,
  TIMELINE_CATEGORY_LABELS,
  formatContactLine,
  timelineSeverityTone,
} from "@/lib/adminShopContact";
import {
  READINESS_CHECK_LABELS,
  READINESS_MISSING_LABELS,
  STOREFRONT_PUBLIC_STATUS_LABEL,
  formatReadinessBadge,
  getStorefrontReviewRecommendation,
  readinessCardTone,
  readinessLabelText,
  readinessTone,
} from "@/lib/storefrontReadiness";
import {
  QUALITY_FLAG_LABELS,
  QUALITY_SIGNAL_LABELS,
  formatQualityBadge,
  qualityCardTone,
  qualityTierLabel,
  qualityTone,
} from "@/lib/storefrontQuality";
import { featuredBadgeLabel, featuredTone } from "@/lib/featuredStorefront";

const publicStatusLabel = {
  pending: "Nháp",
  public: "Công khai",
  suspended: "Đình chỉ",
};

const accountStatusLabel = {
  pending: "Chờ duyệt",
  active: "Hoạt động",
  blocked: "Đã khóa",
  suspended: "Đình chỉ TK",
  deleted: "Đã xóa",
};

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN");
}

function formatNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("vi-VN") : "0";
}

function Card({ title, children, tone = "neutral", style = {} }) {
  const tones = {
    neutral: { bg: "#f9fafb", border: "#e5e7eb" },
    ok: { bg: "#ecfdf5", border: "#bbf7d0" },
    warn: { bg: "#fffbeb", border: "#fde68a" },
    danger: { bg: "#fef2f2", border: "#fecaca" },
    purple: { bg: "#f5f3ff", border: "#ddd6fe" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: 14,
        ...style,
      }}
    >
      {title ? (
        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Stat({ label, value, color = "#111827" }) {
  return (
    <div style={{ textAlign: "center", padding: "8px 4px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{formatNum(value)}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function HealthBadge({ score, label, flags = [] }) {
  const tone = healthTone(label);
  return (
    <div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          background: tone.bg,
          color: tone.color,
          border: `1px solid ${tone.border}`,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span>{score ?? "—"}</span>
        <span>{healthLabelText(label)}</span>
      </div>
      {flags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          {flags.map((f) => (
            <span
              key={f}
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 6,
                background: "#fef2f2",
                color: "#991b1b",
                border: "1px solid #fecaca",
              }}
            >
              {FLAG_LABELS_SHORT[f] || f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ReadinessBadge({ score, status }) {
  const tone = readinessTone(status);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {formatReadinessBadge(score, status)}
    </div>
  );
}

function StorefrontReviewSummarySection({ publicStatus, readiness }) {
  const normalizedStatus = String(publicStatus || "").trim().toLowerCase() || "pending";
  const recommendation = getStorefrontReviewRecommendation(readiness);
  const tone = readinessTone(readiness?.status);

  return (
    <Card title="Review readiness summary" tone={readinessCardTone(readiness?.status)} style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Storefront status
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
            {STOREFRONT_PUBLIC_STATUS_LABEL[normalizedStatus] || publicStatusLabel[normalizedStatus] || normalizedStatus}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Readiness score
          </div>
          <div style={{ marginTop: 4 }}>
            <ReadinessBadge score={readiness?.score ?? 0} status={readiness?.status ?? "incomplete"} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Moderation recommendation
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: tone.color, lineHeight: 1.4 }}>
            {recommendation}
          </div>
        </div>
      </div>
    </Card>
  );
}

function FeaturedStorefrontDiagnosticsSection({ featured }) {
  if (!featured) return null;
  const tone = featuredTone(featured.eligible);

  return (
    <Card title="Featured storefront diagnostics" tone={featured.eligible ? "purple" : "neutral"} style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 999,
            background: tone.bg,
            color: tone.color,
            border: `1px solid ${tone.border}`,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {featuredBadgeLabel(featured.eligible, featured.score)}
        </div>
        <span style={{ fontSize: 12, color: tone.color, fontWeight: 600 }}>
          {featured.eligible ? "Eligible for featured discovery" : "Not eligible for featured discovery"}
        </span>
      </div>

      {(featured.reasons || []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 6 }}>Reasons</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "#166534" }}>
            {featured.reasons.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(featured.blockers || []).length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>Blockers</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "#991b1b" }}>
            {featured.blockers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function StorefrontQualitySection({ quality }) {
  if (!quality) return null;
  const tone = qualityTone(quality.tier);
  const signals = quality.signals || {};

  return (
    <Card title="Storefront quality" tone={qualityCardTone(quality.tier)} style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 999,
            background: tone.bg,
            color: tone.color,
            border: `1px solid ${tone.border}`,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {formatQualityBadge(quality.score, quality.tier)}
        </div>
        <span style={{ fontSize: 12, color: tone.color, fontWeight: 600 }}>
          {qualityTierLabel(quality.tier)}
        </span>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Signals</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
        {Object.entries(QUALITY_SIGNAL_LABELS).map(([key, label]) => (
          <div key={key} style={{ fontSize: 12 }}>
            <span style={{ color: "#6b7280" }}>{label}: </span>
            <strong>{signals[key] ?? 0}/20</strong>
          </div>
        ))}
      </div>

      {(quality.strengths || []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 6 }}>Strengths</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "#166534" }}>
            {quality.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(quality.weaknesses || []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>Weaknesses</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "#92400e" }}>
            {quality.weaknesses.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(quality.flags || []).length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>Flags</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {quality.flags.map((flag) => (
              <span
                key={flag}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "#fee2e2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                }}
              >
                {QUALITY_FLAG_LABELS[flag] || flag}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function StorefrontReadinessSection({ readiness }) {
  if (!readiness) return null;
  const tone = readinessTone(readiness.status);
  const checks = readiness.checks || {};

  return (
    <Card title="Storefront readiness" tone={readinessCardTone(readiness.status)} style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <ReadinessBadge score={readiness.score} status={readiness.status} />
        <span style={{ fontSize: 12, color: tone.color, fontWeight: 600 }}>
          {readinessLabelText(readiness.status)}
        </span>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Checklist</div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 13, lineHeight: 1.8 }}>
        {Object.entries(READINESS_CHECK_LABELS).map(([key, label]) => {
          const ok = Boolean(checks[key]);
          return (
            <li key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: ok ? "#166534" : "#991b1b", fontWeight: 700 }}>{ok ? "✓" : "✗"}</span>
              <span style={{ color: ok ? "#374151" : "#6b7280" }}>{label}</span>
            </li>
          );
        })}
      </ul>

      {(readiness.missing || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>Missing</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {readiness.missing.map((key) => (
              <span
                key={key}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "#fffbeb",
                  color: "#92400e",
                  border: "1px solid #fde68a",
                }}
              >
                {READINESS_MISSING_LABELS[key] || key}
              </span>
            ))}
          </div>
        </div>
      )}

      {(readiness.warnings || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>Warnings</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "#7f1d1d" }}>
            {readiness.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function ContactSummaryBlock({ contact, duplicatePhones }) {
  const c = contact || {};
  const drift = c.driftFlags || [];
  const dupes = duplicatePhones?.matches || [];

  return (
    <Card title="Contact summary" tone={c.hasAnyContact ? "ok" : "warn"} style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", fontSize: 13 }}>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Shop phone</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{formatContactLine(c.shopPhone?.value ?? c.shopPhone)}</div>
          {c.shopPhone?.normalized && (
            <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{c.shopPhone.normalized}</div>
          )}
        </div>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Account phone</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{formatContactLine(c.accountPhone?.value ?? c.accountPhone)}</div>
        </div>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Zalo (resolved)</div>
          <div style={{ fontWeight: 700, marginTop: 4, color: "#166534" }}>{formatContactLine(c.zalo?.value ?? c.primaryZalo)}</div>
          {c.zalo?.source && <div style={{ fontSize: 11, color: "#6b7280" }}>from {c.zalo.source}</div>}
        </div>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Zalo columns</div>
          <div style={{ marginTop: 4, lineHeight: 1.5 }}>
            <div><span style={{ color: "#6b7280" }}>zalo:</span> {formatContactLine(c.zaloColumns?.zalo?.value)}</div>
            <div><span style={{ color: "#6b7280" }}>zalo_phone:</span> {formatContactLine(c.zaloColumns?.zaloPhone?.value)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <span
          style={{
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 999,
            background: c.storefrontContactReady ? "#dcfce7" : "#fee2e2",
            color: c.storefrontContactReady ? "#166534" : "#991b1b",
          }}
        >
          {c.storefrontContactReady ? "Storefront contact ready" : "Missing storefront contact"}
        </span>
        {drift.map((f) => (
          <span
            key={f}
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 999,
              background: "#fffbeb",
              color: "#92400e",
              border: "1px solid #fde68a",
            }}
          >
            {CONTACT_DRIFT_LABELS[f] || f}
          </span>
        ))}
      </div>

      {dupes.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#991b1b", marginBottom: 8 }}>
            Duplicate phone matches ({duplicatePhones?.count ?? dupes.length})
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
            {dupes.slice(0, 5).map((m) => (
              <li key={`${m.accountId}-${m.matchedField}`}>
                <strong>{m.name || `Shop #${m.accountId}`}</strong>
                {m.slug ? ` · ${m.slug}` : ""}
                {m.matchedValue ? ` · ${m.matchedField}: ${m.matchedValue}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function TimelineList({ entries, emptyLabel }) {
  const rows = entries || [];
  if (!rows.length) {
    return <div style={{ fontSize: 13, color: "#6b7280" }}>{emptyLabel}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((e) => {
        const tone = timelineSeverityTone(e.severity);
        return (
          <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: tone.dot, marginTop: 6, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: tone.text }}>{e.title}</span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 6,
                    background: "#f3f4f6",
                    color: "#6b7280",
                  }}
                >
                  {TIMELINE_CATEGORY_LABELS[e.category] || e.category}
                </span>
              </div>
              {e.subtitle && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{e.subtitle}</div>}
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                {formatDate(e.occurredAt)}
                {e.actorLabel ? ` · ${e.actorLabel}` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function mergeListShop(listShop, detail) {
  if (!listShop) return null;
  if (!detail) return listShop;
  return {
    ...listShop,
    governanceShopId: detail.shop?.governanceShopId ?? listShop.governanceShopId,
    slug: detail.shop?.slug ?? listShop.slug,
    shopPublicStatus: detail.storefront?.publicStatus ?? listShop.shopPublicStatus,
    avatar: detail.shop?.avatar ?? listShop.avatar,
    storefrontPreview: detail.storefront?.primary
      ? {
          primary: detail.storefront.primary,
          apex: detail.storefront.apex,
          subdomain: detail.storefront.subdomain,
        }
      : listShop.storefrontPreview,
  };
}

/**
 * Admin shop governance profile drawer (v2).
 * List row from GET /api/admin/shops; detail from GET /api/admin/shops/:id/detail.
 */
export default function AdminShopDetailDrawer({ shop, open, onClose, focusSlug = false, onUpdated }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [slugModalOpen, setSlugModalOpen] = useState(false);
  const [slugToast, setSlugToast] = useState("");
  const [moderationToast, setModerationToast] = useState("");
  const [moderationError, setModerationError] = useState("");

  const loadDetail = useCallback(async () => {
    if (!shop?.id) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await getShopDetail(shop.id);
      setDetail(res.data || null);
    } catch (e) {
      console.error("[AdminShopDetailDrawer] load failed", e);
      setLoadError(e?.response?.data?.message || e.message || "Không thể tải chi tiết shop");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [shop?.id]);

  useEffect(() => {
    if (open && shop?.id) {
      loadDetail();
    } else if (!open) {
      setDetail(null);
      setLoadError("");
    }
  }, [open, shop?.id, loadDetail]);

  useEffect(() => {
    if (open && focusSlug) {
      setSlugModalOpen(true);
    } else if (!open) {
      setSlugModalOpen(false);
    }
  }, [open, focusSlug]);

  if (!open || !shop) return null;

  const panelShop = mergeListShop(shop, detail);
  const d = detail;
  const storefrontHref = d?.storefront?.primary || shop.storefrontPreview?.primary || shop.storefrontPreview?.apex || null;
  const moderationHealth =
    (d?.moderation?.rejected || 0) > 0 || (d?.moderation?.pending || 0) > 5
      ? "warn"
      : (d?.moderation?.approved || 0) > 0
        ? "ok"
        : "neutral";
  const shopHealth = d?.health;
  const storefrontReadiness = d?.storefrontReadiness;
  const storefrontQuality = d?.storefrontQuality;
  const featuredStorefront = d?.featuredStorefront;
  const warnings = d?.recommendations?.warnings || [];
  const governanceShopId = d?.shop?.governanceShopId ?? shop.governanceShopId;
  const storefrontPublicStatus = d?.governance?.storefrontStatus ?? d?.storefront?.publicStatus ?? shop.shopPublicStatus;
  const accountStatus = d?.governance?.accountStatus ?? shop.status;
  const generalRecs = d?.recommendations?.general || [];
  const contact = d?.contact;
  const duplicatePhones = d?.duplicatePhones;
  const timeline = d?.timeline || [];
  const auditTrail = d?.auditTrail || [];
  const slugHistory = timeline.filter((e) => e.category === "slug");
  const lastSlugUpdate = slugHistory[0]?.occurredAt || null;
  const slugModalShop = {
    ...shop,
    slug: d?.shop?.slug ?? shop.slug,
    name: d?.shop?.name ?? shop.name,
    storefrontPreview: d?.storefront?.primary
      ? {
          primary: d.storefront.primary,
          subdomain: d.storefront.subdomain,
          apex: d.storefront.apex,
        }
      : shop.storefrontPreview,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 60,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          height: "100%",
          background: "white",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          overflowY: "auto",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>Shop governance profile</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Operational summary · storefront · moderation</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#6b7280", lineHeight: 1 }}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
          {(d?.shop?.avatar || shop.avatar) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d?.shop?.avatar || shop.avatar}
              alt=""
              style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover", border: "1px solid #e5e7eb", flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                background: "#f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              Logo
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.3 }}>{d?.shop?.name || shop.name}</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{d?.shop?.email || shop.email}</div>
            {(d?.shop?.slug || shop.slug) && (
              <code style={{ display: "inline-block", marginTop: 6, fontSize: 12, background: "#f3f4f6", padding: "2px 8px", borderRadius: 6 }}>
                {d?.shop?.slug || shop.slug}
              </code>
            )}
            {shopHealth && (
              <div style={{ marginTop: 10 }}>
                <HealthBadge
                  score={shopHealth.healthScore}
                  label={shopHealth.healthLabel}
                  flags={shopHealth.attentionFlags}
                />
              </div>
            )}
            {storefrontHref ? (
              <div style={{ marginTop: 8 }}>
                <a href={storefrontHref} target="_blank" rel="noopener noreferrer" style={{ color: "#059669", fontSize: 12, wordBreak: "break-all" }}>
                  {storefrontHref}
                </a>
              </div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {storefrontHref && (
                <a
                  href={storefrontHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    background: "#059669",
                    color: "white",
                    textDecoration: "none",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Mở storefront
                </a>
              )}
              {(d?.shop?.governanceShopId ?? shop.governanceShopId) != null && (
                <a
                  href={`/admin/shops/${d?.shop?.governanceShopId ?? shop.governanceShopId}/governance`}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    background: "#7c3aed",
                    color: "white",
                    textDecoration: "none",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Governance detail
                </a>
              )}
              <button
                type="button"
                onClick={() => setSlugModalOpen(true)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #7c3aed",
                  background: "white",
                  color: "#6d28d9",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Quản lý slug
              </button>
            </div>
          </div>
        </div>

        {loading && <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>Đang tải chi tiết...</p>}

        {!loading && loadError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 13, marginBottom: 6 }}>Lỗi tải chi tiết</div>
            <div style={{ fontSize: 13, color: "#991b1b", marginBottom: 10 }}>{loadError}</div>
            <button
              type="button"
              onClick={loadDetail}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "none",
                background: "#dc2626",
                color: "white",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Thử lại
            </button>
          </div>
        )}

        <StorefrontDomainSection
          shop={{
            ...shop,
            slug: d?.shop?.slug ?? shop.slug,
            storefrontPreview: slugModalShop.storefrontPreview,
          }}
          storefront={d?.storefront}
          storefrontStatus={d?.governance?.storefrontStatus ?? shop.shopPublicStatus}
          slugHistory={slugHistory}
          lastSlugUpdate={lastSlugUpdate}
          onManageSlug={() => setSlugModalOpen(true)}
        />

        {d && !loadError && (
          <>
            {/* Governance cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
              <Card title="Tài khoản" tone={d.governance?.accountStatus === "active" ? "ok" : d.governance?.accountStatus === "blocked" ? "danger" : "warn"}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{accountStatusLabel[d.governance?.accountStatus] || d.governance?.accountStatus || "—"}</div>
              </Card>
              <Card title="Storefront" tone={d.storefront?.isLive ? "ok" : d.governance?.storefrontStatus === "suspended" ? "danger" : "warn"}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{publicStatusLabel[d.governance?.storefrontStatus] || d.governance?.storefrontStatus || "—"}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{d.storefront?.isLive ? "Đang live" : "Không public"}</div>
              </Card>
              <Card title="Rủi ro" tone={d.governance?.riskLevel === "high" ? "danger" : d.governance?.riskScore != null ? "purple" : "neutral"}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {d.governance?.riskScore != null ? d.governance.riskScore : "—"}
                  {d.governance?.riskLevel ? ` · ${d.governance.riskLevel}` : ""}
                </div>
              </Card>
              <Card title="Moderation health" tone={moderationHealth}>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Chờ: <strong>{formatNum(d.moderation?.pending)}</strong> · Từ chối:{" "}
                  <strong style={{ color: "#991b1b" }}>{formatNum(d.moderation?.rejected)}</strong>
                </div>
              </Card>
            </div>

            <StorefrontReviewSummarySection
              publicStatus={storefrontPublicStatus}
              readiness={storefrontReadiness}
            />

            <StorefrontReadinessSection readiness={storefrontReadiness} />

            <StorefrontQualitySection quality={storefrontQuality} />

            <FeaturedStorefrontDiagnosticsSection featured={featuredStorefront} />

            {moderationError ? (
              <div
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                {moderationError}
              </div>
            ) : null}

            {governanceShopId != null ? (
              <Card title="Storefront actions" tone="neutral" style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0, marginBottom: 10 }}>
                  Chỉ thay đổi trạng thái public storefront — không khóa tài khoản seller.
                </p>
                <AdminStorefrontModerationActions
                  governanceShopId={governanceShopId}
                  publicStatus={storefrontPublicStatus}
                  accountStatus={accountStatus}
                  onSuccess={(message) => {
                    setModerationError("");
                    setModerationToast(message || "Đã cập nhật storefront");
                    loadDetail();
                    onUpdated?.();
                    window.setTimeout(() => setModerationToast(""), 3500);
                  }}
                  onError={setModerationError}
                />
              </Card>
            ) : null}

            {warnings.length > 0 && (
              <Card title="Warnings" tone="danger" style={{ marginBottom: 16 }}>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                  {warnings.map((w) => (
                    <li key={w.flag} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, color: "#991b1b" }}>{w.label}</div>
                      <div style={{ color: "#7f1d1d", marginTop: 2 }}>{w.recommendation}</div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {generalRecs.length > 0 && (
              <Card title="Operational recommendations" tone="warn" style={{ marginBottom: 16 }}>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "#92400e" }}>
                  {generalRecs.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </Card>
            )}

            <ContactSummaryBlock contact={contact} duplicatePhones={duplicatePhones} />

            {/* Shop info */}
            <Card title="Shop profile" tone="neutral" style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 13 }}>
                <div><span style={{ color: "#6b7280" }}>shops.id</span><br /><strong>{d.shop?.governanceShopId ?? "—"}</strong></div>
                <div><span style={{ color: "#6b7280" }}>shop_accounts.id</span><br /><strong>{d.shop?.id ?? shop.id}</strong></div>
                <div><span style={{ color: "#6b7280" }}>Email shop</span><br />{d.shop?.email || "—"}</div>
                <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#6b7280" }}>Địa chỉ</span><br />{d.shop?.address || "—"}</div>
                <div><span style={{ color: "#6b7280" }}>Tạo</span><br />{formatDate(d.shop?.createdAt)}</div>
                <div><span style={{ color: "#6b7280" }}>Cập nhật</span><br />{formatDate(d.shop?.updatedAt)}</div>
              </div>
            </Card>

            {/* Product moderation */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#374151" }}>Product moderation</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, background: "#f9fafb", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                <Stat label="Tổng SP" value={d.moderation?.totalProducts} />
                <Stat label="Đã duyệt" value={d.moderation?.approved} color="#166534" />
                <Stat label="Chờ duyệt" value={d.moderation?.pending} color="#92400e" />
                <Stat label="Từ chối" value={d.moderation?.rejected} color="#991b1b" />
                <Stat label="Ẩn" value={d.moderation?.hidden} />
                <Stat label="Lưu trữ" value={d.moderation?.archived} />
                <Stat label="Hết hàng" value={d.moderation?.outOfStock} color="#c2410c" />
              </div>
            </div>

            {/* Performance metrics 30d */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#374151" }}>Performance (30 ngày)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                <Card tone="neutral"><Stat label="RFQ nhận" value={d.metrics?.rfqReceived30d} /></Card>
                <Card tone="neutral"><Stat label="CTA click" value={d.metrics?.cta30d} /></Card>
                <Card tone="neutral"><Stat label="Lượt xem SF" value={d.metrics?.views30d} /></Card>
                <Card tone="neutral"><Stat label="Hội thoại" value={d.metrics?.conversations30d} /></Card>
                <Card tone="neutral"><Stat label="Khách quay lại" value={d.metrics?.returningVisitors30d} /></Card>
              </div>
            </div>

            {/* Governance timeline */}
            <Card title="Governance timeline" tone="neutral" style={{ marginBottom: 16 }}>
              <TimelineList entries={timeline} emptyLabel="Chưa có sự kiện governance." />
            </Card>

            <Card title="Operational audit trail" tone="purple" style={{ marginBottom: 16 }}>
              <TimelineList entries={auditTrail} emptyLabel="Chưa có bản ghi audit/enforcement." />
            </Card>

            {/* Legacy activity snapshot */}
            <Card title="Activity snapshot" tone="neutral" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div><span style={{ color: "#6b7280" }}>Shop tạo</span> — {formatDate(d.activity?.shopCreatedAt)}</div>
                <div><span style={{ color: "#6b7280" }}>Storefront gần nhất</span> — {formatDate(d.activity?.lastStorefrontEventAt)}</div>
                <div>
                  <span style={{ color: "#6b7280" }}>Moderation gần nhất</span> —{" "}
                  {d.activity?.lastModerationActionAt
                    ? `${formatDate(d.activity.lastModerationActionAt)}${d.activity.lastModerationActionLabel ? ` · ${d.activity.lastModerationActionLabel}` : ""}`
                    : "—"}
                </div>
                {d.governance?.suspendedAt && (
                  <div style={{ color: "#991b1b" }}>
                    <span style={{ color: "#6b7280" }}>Đình chỉ</span> — {formatDate(d.governance.suspendedAt)}
                    {d.governance.suspendedReason ? ` · ${d.governance.suspendedReason}` : ""}
                  </div>
                )}
              </div>
            </Card>
          </>
        )}

        <div
          style={{
            background: focusSlug ? "#fffbeb" : "transparent",
            border: focusSlug ? "1px solid #fde68a" : "none",
            borderRadius: 12,
            padding: focusSlug ? 12 : 0,
            marginBottom: focusSlug ? 8 : 0,
          }}
        >
          <AdminShopStorefrontPanel
            shop={panelShop}
            onUpdated={() => {
              loadDetail();
              onUpdated?.();
            }}
          />
        </div>
      </div>

      <ShopSlugManagementModal
        shop={slugModalShop}
        open={slugModalOpen}
        onClose={() => setSlugModalOpen(false)}
        onSuccess={() => {
          setSlugModalOpen(false);
          setSlugToast("Đã cập nhật slug");
          loadDetail();
          onUpdated?.();
          window.setTimeout(() => setSlugToast(""), 3500);
        }}
      />

      {slugToast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            zIndex: 80,
            background: "#166534",
            color: "white",
            padding: "12px 18px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          }}
        >
          {slugToast}
        </div>
      )}

      {moderationToast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 80,
            background: "#166534",
            color: "white",
            padding: "12px 18px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          }}
        >
          {moderationToast}
        </div>
      )}
    </div>
  );
}
