"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getShops, updateShopStatus } from "../../api/adminApi";
import ShopDeleteModal from "@/components/admin/ShopDeleteModal";
import ShopSlugManagementModal from "@/components/admin/ShopSlugManagementModal";
import AdminShopDetailDrawer from "@/components/admin/AdminShopDetailDrawer";
import AdminStorefrontModerationActions from "@/components/admin/AdminStorefrontModerationActions";
import { FLAG_LABELS_SHORT, healthLabelText, healthTone } from "@/lib/adminShopHealth";
import { CONTACT_DRIFT_LABELS, contactDriftTone, formatContactLine } from "@/lib/adminShopContact";
import { formatReadinessBadge, readinessTone } from "@/lib/storefrontReadiness";
import { formatQualityBadge, qualityTone } from "@/lib/storefrontQuality";
import { featuredBadgeLabel, featuredTone } from "@/lib/featuredStorefront";

const PAGE_SIZE = 25;

const STOREFRONT_REVIEW_CHIPS = [
  { id: "", label: "Storefront: tất cả" },
  { id: "pending_review", label: "Pending review" },
  { id: "public", label: "Public" },
  { id: "suspended", label: "Suspended" },
  { id: "incomplete", label: "Incomplete" },
];

const SEGMENTS = [
  { id: "all", label: "Tất cả" },
  { id: "public", label: "Public" },
  { id: "draft", label: "Nháp" },
  { id: "suspended", label: "Suspended" },
  { id: "inactive", label: "Inactive" },
  { id: "empty", label: "Empty" },
  { id: "high_risk", label: "High risk" },
  { id: "attention", label: "Attention" },
];

const SORTS = [
  { id: "newest", label: "Mới nhất" },
  { id: "products_desc", label: "Nhiều SP nhất" },
  { id: "rfq_desc", label: "RFQ 30d" },
  { id: "last_activity_desc", label: "Hoạt động gần nhất" },
  { id: "risk_desc", label: "Rủi ro cao" },
];

const accountStatusLabel = {
  pending: "Chờ duyệt",
  active: "Hoạt động",
  blocked: "Khóa",
  suspended: "Đình chỉ TK",
};

const storefrontStatusLabel = {
  pending: "Nháp",
  public: "Public",
  suspended: "Suspended",
};

const EMPTY_SUMMARY = {
  totalShops: 0,
  publicStorefronts: 0,
  suspendedShops: 0,
  inactiveShops: 0,
  emptyShops: 0,
  highRiskShops: 0,
  attentionShops: 0,
};

function formatActivity(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN");
}

function formatNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("vi-VN") : "0";
}

function actionBtnStyle(bg) {
  return {
    background: bg,
    color: "white",
    border: "none",
    padding: "5px 10px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

function dangerSecondaryBtnStyle() {
  return {
    background: "#fff",
    color: "#991b1b",
    border: "1px solid #fecaca",
    padding: "5px 10px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

function outlineBtnStyle() {
  return {
    background: "white",
    color: "#374151",
    border: "1px solid #d1d5db",
    padding: "5px 10px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

function formatLoadError(err) {
  const status = err?.response?.status;
  const msg =
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message;
  if (status) {
    return `Không thể tải danh sách shop (HTTP ${status})${msg ? `: ${msg}` : ""}`;
  }
  return msg || "Không thể tải danh sách shop.";
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
          padding: "3px 8px",
          borderRadius: 999,
          background: tone.bg,
          color: tone.color,
          border: `1px solid ${tone.border}`,
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        <span>{score ?? "—"}</span>
        <span>{healthLabelText(label)}</span>
      </div>
      {flags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {flags.slice(0, 3).map((f) => (
            <span
              key={f}
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 6,
                background: "#f3f4f6",
                color: "#6b7280",
              }}
            >
              {FLAG_LABELS_SHORT[f] || f}
            </span>
          ))}
          {flags.length > 3 && (
            <span style={{ fontSize: 10, color: "#9ca3af" }}>+{flags.length - 3}</span>
          )}
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
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        fontSize: 11,
        fontWeight: 700,
        marginTop: 6,
      }}
    >
      {formatReadinessBadge(score, status)}
    </div>
  );
}

function QualityBadge({ score, tier }) {
  const tone = qualityTone(tier);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        fontSize: 11,
        fontWeight: 700,
        marginTop: 6,
      }}
    >
      {formatQualityBadge(score, tier)}
    </div>
  );
}

function FeaturedBadge({ eligible, score }) {
  const tone = featuredTone(eligible);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        fontSize: 11,
        fontWeight: 700,
        marginTop: 6,
      }}
    >
      {featuredBadgeLabel(eligible, score)}
    </div>
  );
}

function ContactCell({ contact }) {
  const c = contact || {};
  const drift = c.driftFlags || [];
  const driftTone = contactDriftTone(drift);

  return (
    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
      <div>
        <span style={{ color: "#6b7280" }}>Shop:</span>{" "}
        <span style={{ fontWeight: c.shopPhone ? 600 : 400, color: c.shopPhone ? "#111827" : "#9ca3af" }}>
          {formatContactLine(c.shopPhone)}
        </span>
      </div>
      <div>
        <span style={{ color: "#6b7280" }}>TK:</span>{" "}
        <span style={{ color: c.accountPhone ? "#111827" : "#9ca3af" }}>{formatContactLine(c.accountPhone)}</span>
      </div>
      <div>
        <span style={{ color: "#6b7280" }}>Zalo:</span>{" "}
        <span style={{ color: c.zalo ? "#166534" : "#9ca3af", fontWeight: c.zalo ? 600 : 400 }}>
          {formatContactLine(c.zalo)}
        </span>
      </div>
      {drift.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {drift.map((f) => (
            <span
              key={f}
              style={{
                display: "inline-block",
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 6,
                background: driftTone.bg,
                color: driftTone.color,
                border: `1px solid ${driftTone.border}`,
                marginRight: 4,
              }}
            >
              {CONTACT_DRIFT_LABELS[f] || f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, tone = "neutral", active, onClick }) {
  const tones = {
    neutral: { bg: "#f9fafb", border: "#e5e7eb", color: "#111827" },
    green: { bg: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
    amber: { bg: "#fffbeb", border: "#fde68a", color: "#92400e" },
    red: { bg: "#fef2f2", border: "#fecaca", color: "#991b1b" },
    purple: { bg: "#f5f3ff", border: "#ddd6fe", color: "#6d28d9" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        background: active ? t.bg : "white",
        border: `2px solid ${active ? t.border : "#e5e7eb"}`,
        borderRadius: 12,
        padding: "12px 14px",
        cursor: onClick ? "pointer" : "default",
        minWidth: 120,
        flex: "1 1 120px",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, color: t.color }}>{formatNum(value)}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{label}</div>
    </button>
  );
}

const selectStyle = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 13,
  background: "white",
  minWidth: 120,
};

export default function AdminShops() {
  const [shops, setShops] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [segment, setSegment] = useState("all");
  const [sort, setSort] = useState("newest");
  const [accountStatus, setAccountStatus] = useState("");
  const [storefrontStatus, setStorefrontStatus] = useState("");
  const [storefrontReview, setStorefrontReview] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [hasProducts, setHasProducts] = useState("");
  const [publicOnly, setPublicOnly] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ open: false, shop: null });
  const [slugModal, setSlugModal] = useState({ open: false, shop: null });
  const [slugToast, setSlugToast] = useState("");
  const [deleteToast, setDeleteToast] = useState("");
  const [moderationToast, setModerationToast] = useState("");
  const [actionError, setActionError] = useState("");
  const [detailDrawer, setDetailDrawer] = useState({ open: false, shop: null, focusSlug: false });

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      sort,
      segment: segment === "all" ? undefined : segment,
      q: qDebounced || undefined,
      accountStatus: accountStatus || undefined,
      storefrontStatus: storefrontStatus || undefined,
      storefrontReview: storefrontReview || undefined,
      riskLevel: riskLevel || undefined,
      hasProducts: hasProducts === "" ? undefined : hasProducts,
      publicOnly: publicOnly ? "1" : undefined,
      inactive: inactive ? "1" : undefined,
    }),
    [
      page,
      sort,
      segment,
      qDebounced,
      accountStatus,
      storefrontStatus,
      storefrontReview,
      riskLevel,
      hasProducts,
      publicOnly,
      inactive,
    ],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const res = await getShops(queryParams);
      const data = res.data;
      if (Array.isArray(data)) {
        setShops(data);
        setTotal(data.length);
        setSummary(EMPTY_SUMMARY);
      } else {
        setShops(Array.isArray(data?.items) ? data.items : []);
        setTotal(Number(data?.total) || 0);
        setSummary({ ...EMPTY_SUMMARY, ...(data?.summary || {}) });
      }
    } catch (e) {
      console.error("LOAD SHOPS FAIL", e);
      setLoadError(formatLoadError(e));
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [qDebounced, segment, sort, accountStatus, storefrontStatus, storefrontReview, riskLevel, hasProducts, publicOnly, inactive]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function changeStatus(id, status) {
    let text = "Bạn chắc chắn muốn thay đổi trạng thái shop?";
    if (status === "active") text = "Mở khóa shop này và cho phép hoạt động trở lại?";
    if (status === "blocked") text = "Khóa shop này?";
    if (!window.confirm(text)) return;
    await updateShopStatus(id, status);
    load();
  }

  function openSlugModal(shop) {
    setSlugModal({ open: true, shop });
  }

  function handleSlugSuccess() {
    setSlugModal({ open: false, shop: null });
    setSlugToast("Đã cập nhật slug");
    load();
    window.setTimeout(() => setSlugToast(""), 3500);
  }

  function openDeleteModal(shop) {
    setDeleteModal({ open: true, shop });
  }

  async function handleDeleteSuccess(deletedId) {
    setDeleteModal({ open: false, shop: null });
    setShops((prev) => prev.filter((s) => s.id !== deletedId));
    if (detailDrawer.shop?.id === deletedId) {
      setDetailDrawer({ open: false, shop: null, focusSlug: false });
    }
    setDeleteToast("Đã xóa shop");
    await load();
    window.setTimeout(() => setDeleteToast(""), 3500);
  }

  function openDetail(shop, focusSlug = false) {
    setDetailDrawer({ open: true, shop, focusSlug });
  }

  function handleModerationSuccess(message) {
    setModerationToast(message || "Đã cập nhật storefront");
    setActionError("");
    load();
    window.setTimeout(() => setModerationToast(""), 3500);
  }

  function applySegment(next) {
    setSegment(next);
    setPage(1);
  }

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <Link href="/admin/part-knowledge" prefetch={false}>
          Otofine Knowledge Engine →
        </Link>
      </p>
      <h2>Quản lý Shop — Operations</h2>
      <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
        Marketplace operations dashboard · tài khoản seller và storefront là hai lớp trạng thái độc lập.
      </p>

      {/* KPI cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <KpiCard
          label="Tổng shop"
          value={summary.totalShops}
          active={segment === "all"}
          onClick={() => applySegment("all")}
        />
        <KpiCard
          label="Public storefront"
          value={summary.publicStorefronts}
          tone="green"
          active={segment === "public"}
          onClick={() => applySegment("public")}
        />
        <KpiCard
          label="Suspended"
          value={summary.suspendedShops}
          tone="red"
          active={segment === "suspended"}
          onClick={() => applySegment("suspended")}
        />
        <KpiCard
          label="Inactive 30d"
          value={summary.inactiveShops}
          tone="amber"
          active={segment === "inactive"}
          onClick={() => applySegment("inactive")}
        />
        <KpiCard
          label="Empty catalog"
          value={summary.emptyShops}
          tone="neutral"
          active={segment === "empty"}
          onClick={() => applySegment("empty")}
        />
        <KpiCard
          label="High risk"
          value={summary.highRiskShops}
          tone="purple"
          active={segment === "high_risk"}
          onClick={() => applySegment("high_risk")}
        />
        <KpiCard
          label="Attention"
          value={summary.attentionShops}
          tone="red"
          active={segment === "attention"}
          onClick={() => applySegment("attention")}
        />
      </div>

      {/* Search + sort */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <input
          type="search"
          placeholder="Tìm tên, email, phone, slug..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            flex: "1 1 220px",
            minWidth: 200,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 14,
          }}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              Sắp xếp: {s.label}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {loading ? "Đang tải..." : `${formatNum(total)} kết quả`}
        </span>
      </div>

      {/* Segment tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {SEGMENTS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => applySegment(tab.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: segment === tab.id ? "1px solid #7c3aed" : "1px solid #d1d5db",
              background: segment === tab.id ? "#f5f3ff" : "white",
              color: segment === tab.id ? "#6d28d9" : "#374151",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Storefront review filter chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {STOREFRONT_REVIEW_CHIPS.map((chip) => (
          <button
            key={chip.id || "all"}
            type="button"
            onClick={() => setStorefrontReview(chip.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: storefrontReview === chip.id ? "1px solid #059669" : "1px solid #d1d5db",
              background: storefrontReview === chip.id ? "#ecfdf5" : "white",
              color: storefrontReview === chip.id ? "#047857" : "#374151",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginBottom: 16,
          padding: 12,
          background: "#f9fafb",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      >
        <select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value)} style={selectStyle}>
          <option value="">Tài khoản: tất cả</option>
          <option value="pending">Chờ duyệt</option>
          <option value="active">Hoạt động</option>
          <option value="blocked">Khóa</option>
          <option value="suspended">Đình chỉ TK</option>
        </select>
        <select value={storefrontStatus} onChange={(e) => setStorefrontStatus(e.target.value)} style={selectStyle}>
          <option value="">Storefront: tất cả</option>
          <option value="pending">Nháp</option>
          <option value="public">Public</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} style={selectStyle}>
          <option value="">Rủi ro: tất cả</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select value={hasProducts} onChange={(e) => setHasProducts(e.target.value)} style={selectStyle}>
          <option value="">Sản phẩm: tất cả</option>
          <option value="1">Có SP</option>
          <option value="0">Không SP</option>
        </select>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={publicOnly} onChange={(e) => setPublicOnly(e.target.checked)} />
          Public only
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />
          Inactive 30d
        </label>
        <button
          type="button"
          style={outlineBtnStyle()}
          onClick={() => {
            setQ("");
            setSegment("all");
            setSort("newest");
            setAccountStatus("");
            setStorefrontStatus("");
            setStorefrontReview("");
            setRiskLevel("");
            setHasProducts("");
            setPublicOnly(false);
            setInactive(false);
            setPage(1);
          }}
        >
          Xóa lọc
        </button>
      </div>

      {!loading && loadError && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: "14px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Lỗi tải danh sách shop</div>
          <div style={{ lineHeight: 1.5, marginBottom: 12 }}>{loadError}</div>
          <button type="button" style={actionBtnStyle("#dc2626")} onClick={() => load()}>
            Thử lại
          </button>
        </div>
      )}

      {actionError && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <span style={{ lineHeight: 1.5 }}>{actionError}</span>
          <button
            onClick={() => setActionError("")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 18,
              color: "#991b1b",
            }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ minWidth: 1200 }}>
          <thead>
            <tr>
              <th>Shop</th>
              <th>Tài khoản</th>
              <th>Storefront</th>
              <th>Liên hệ</th>
              <th>Sản phẩm</th>
              <th>Health</th>
              <th>Rủi ro</th>
              <th>Hoạt động</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "#6b7280" }}>
                  Đang tải...
                </td>
              </tr>
            )}

            {!loading && loadError && shops.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "#991b1b" }}>
                  Không thể hiển thị danh sách shop. Dùng nút &quot;Thử lại&quot; phía trên.
                </td>
              </tr>
            )}

            {!loading && !loadError && shops.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center" }}>
                  Không có shop phù hợp bộ lọc
                </td>
              </tr>
            )}

            {!loadError &&
              !loading &&
              shops.map((s) => {
                const storefrontHref = s.storefrontPreview?.primary || s.storefrontPreview?.apex || null;

                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {s.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.avatar}
                            alt=""
                            style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }}
                          />
                        ) : null}
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.name}</div>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>{s.email}</div>
                          {s.slug && (
                            <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{s.slug}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span>{accountStatusLabel[s.status] || s.status}</span>
                    </td>
                    <td>
                      <div>{storefrontStatusLabel[s.shopPublicStatus] || s.shopPublicStatus || "—"}</div>
                      {storefrontHref && (
                        <a
                          href={storefrontHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 11, color: "#059669" }}
                        >
                          Mở →
                        </a>
                      )}
                    </td>
                    <td>
                      <ContactCell contact={s.contact} />
                    </td>
                    <td style={{ fontSize: 13 }}>
                      <div>
                        <strong>{s.productCount ?? 0}</strong> SP
                      </div>
                      <div style={{ color: "#92400e" }}>Chờ: {s.pendingModerationCount ?? 0}</div>
                      <div style={{ color: "#991b1b" }}>Từ chối: {s.rejectedModerationCount ?? 0}</div>
                    </td>
                    <td>
                      <HealthBadge
                        score={s.healthScore}
                        label={s.healthLabel}
                        flags={s.attentionFlags}
                      />
                      {s.storefrontReadiness && (
                        <ReadinessBadge
                          score={s.storefrontReadiness.score}
                          status={s.storefrontReadiness.status}
                        />
                      )}
                      {s.storefrontQuality && (
                        <QualityBadge
                          score={s.storefrontQuality.score}
                          tier={s.storefrontQuality.tier}
                        />
                      )}
                      {s.featuredStorefront && (
                        <FeaturedBadge
                          eligible={s.featuredStorefront.eligible}
                          score={s.featuredStorefront.score}
                        />
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {s.riskScore != null ? (
                        <>
                          <div>
                            <strong>{s.riskScore}</strong>
                          </div>
                          <div style={{ color: "#6b7280" }}>{s.riskLevel || "low"}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{formatActivity(s.lastStorefrontActivityAt)}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 320 }}>
                        <button type="button" style={outlineBtnStyle()} onClick={() => openDetail(s)}>
                          Chi tiết
                        </button>

                        {storefrontHref && (
                          <a
                            href={storefrontHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ ...outlineBtnStyle(), textDecoration: "none", display: "inline-block" }}
                          >
                            Storefront
                          </a>
                        )}

                        {s.governanceShopId != null && (
                          <Link
                            href={`/admin/shops/${s.governanceShopId}/governance`}
                            style={{ ...outlineBtnStyle(), textDecoration: "none", display: "inline-block" }}
                          >
                            Governance
                          </Link>
                        )}

                        <button type="button" style={outlineBtnStyle()} onClick={() => openSlugModal(s)}>
                          Quản lý slug
                        </button>

                        {s.status === "pending" && (
                          <button type="button" style={actionBtnStyle("#2563eb")} onClick={() => changeStatus(s.id, "active")}>
                            Duyệt
                          </button>
                        )}
                        {s.status === "active" && (
                          <button type="button" style={actionBtnStyle("#d97706")} onClick={() => changeStatus(s.id, "blocked")}>
                            Khóa
                          </button>
                        )}
                        {(s.status === "blocked" || s.accountStatus === "blocked") && (
                          <>
                            <button type="button" style={actionBtnStyle("#2563eb")} onClick={() => changeStatus(s.id, "active")}>
                              Mở khóa
                            </button>
                            <button type="button" style={dangerSecondaryBtnStyle()} onClick={() => openDeleteModal(s)}>
                              Xóa
                            </button>
                          </>
                        )}

                        {s.governanceShopId != null && (
                          <AdminStorefrontModerationActions
                            governanceShopId={s.governanceShopId}
                            publicStatus={s.shopPublicStatus}
                            accountStatus={s.status}
                            compact
                            onSuccess={handleModerationSuccess}
                            onError={setActionError}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loadError && totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 16,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            Trang {page} / {totalPages} · {formatNum(total)} shop
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={outlineBtnStyle()}
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Trước
            </button>
            <button
              type="button"
              style={outlineBtnStyle()}
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Sau →
            </button>
          </div>
        </div>
      )}

      {deleteModal.open && deleteModal.shop && (
        <ShopDeleteModal
          shop={deleteModal.shop}
          onClose={() => setDeleteModal({ open: false, shop: null })}
          onSuccess={handleDeleteSuccess}
        />
      )}

      {slugModal.open && slugModal.shop && (
        <ShopSlugManagementModal
          shop={slugModal.shop}
          open={slugModal.open}
          onClose={() => setSlugModal({ open: false, shop: null })}
          onSuccess={handleSlugSuccess}
        />
      )}

      {slugToast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            zIndex: 70,
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

      {deleteToast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 70,
            background: "#166534",
            color: "white",
            padding: "12px 18px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          }}
        >
          {deleteToast}
        </div>
      )}

      {moderationToast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 70,
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

      <AdminShopDetailDrawer
        shop={detailDrawer.shop}
        open={detailDrawer.open}
        focusSlug={detailDrawer.focusSlug}
        onClose={() => setDetailDrawer({ open: false, shop: null, focusSlug: false })}
        onUpdated={load}
      />
    </div>
  );
}
