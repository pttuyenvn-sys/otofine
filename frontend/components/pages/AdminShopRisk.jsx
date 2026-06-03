"use client";

import { useEffect, useState } from "react";
import { getShopRisk } from "@/lib/adminApi";
import { formatAdminApiError } from "@/lib/adminApiErrors";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/AdminLoadState";

function RiskBadge({ level }) {
  const theme = (() => {
    switch (level) {
      case "critical":
        return { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" };
      case "high":
        return { bg: "#ffedd5", fg: "#7c2d12", border: "#fed7aa" };
      case "medium":
        return { bg: "#fff7ed", fg: "#92400e", border: "#ffedd5" };
      case "low":
      default:
        return { bg: "#ecfdf5", fg: "#065f46", border: "#bbf7d0" };
    }
  })();
  return (
    <span style={{ background: theme.bg, color: theme.fg, border: `1px solid ${theme.border}`, padding: "6px 10px", borderRadius: 999, fontWeight: 800, fontSize: 12 }}>
      {level || "low"}
    </span>
  );
}

export default function AdminShopRisk() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadState, setLoadState] = useState("loading");

  async function load() {
    try {
      setLoading(true);
      setError("");
      setLoadState("loading");
      const res = await getShopRisk({ limit: 500 });
      const next = res.data?.rows || [];
      setRows(next);
      setLoadState(next.length ? "ready" : "empty");
    } catch (e) {
      console.error(e);
      setRows([]);
      setError(formatAdminApiError(e, {
        module: "shop-risk",
        permissionDenied: "You do not have permission to view shop risk scores.",
      }));
      setLoadState("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700 }}>Shop Risk Scores</h1>
        <div style={{ opacity: 0.7, lineHeight: 1.5 }}>
          Deterministic shop-level risk signals from <code>/api/admin/platform/shop-risk</code>.
        </div>
      </div>

      {loading && <AdminLoadingState message="Loading shop risk scores..." />}
      {!loading && loadState === "error" && (
        <AdminErrorState title="Shop risk unavailable" message={error} onRetry={load} />
      )}
      {!loading && loadState === "empty" && (
        <AdminEmptyState
          title="No shop risk data"
          message="The endpoint responded successfully, but no shop risk rows are available yet."
        />
      )}

      {!loading && loadState === "ready" && (
        <div style={{ background: "white", borderRadius: 12, padding: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 12 }}>Shop</th>
                <th style={{ textAlign: "left", padding: 12 }}>Risk Score</th>
                <th style={{ textAlign: "left", padding: 12 }}>Level</th>
                <th style={{ textAlign: "left", padding: 12 }}>Rejected</th>
                <th style={{ textAlign: "left", padding: 12 }}>Prohibited</th>
                <th style={{ textAlign: "left", padding: 12 }}>Duplicate</th>
                <th style={{ textAlign: "left", padding: 12 }}>Spam</th>
                <th style={{ textAlign: "left", padding: 12 }}>Hidden</th>
                <th style={{ textAlign: "left", padding: 12 }}>Last Calculated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const requiresManualReview = r.riskLevel === "critical";
                const shouldAutoSuspend = Number(r.riskScore || 0) >= 150;
                return (
                  <tr key={r.shopId} style={{ borderTop: "1px solid #f3f4f6", background: requiresManualReview ? "#fff7f0" : "transparent" }}>
                    <td style={{ padding: 12, fontWeight: 700 }}>{r.shopName || `shop#${r.shopId}`}</td>
                    <td style={{ padding: 12 }}>{r.riskScore}</td>
                    <td style={{ padding: 12 }}><RiskBadge level={r.riskLevel} /></td>
                    <td style={{ padding: 12 }}>{r.rejectedProductsCount}</td>
                    <td style={{ padding: 12 }}>{r.prohibitedContentCount}</td>
                    <td style={{ padding: 12 }}>{r.duplicateListingCount}</td>
                    <td style={{ padding: 12 }}>{r.spamRejectCount}</td>
                    <td style={{ padding: 12 }}>{r.hiddenProductsCount}</td>
                    <td style={{ padding: 12 }}>{r.lastCalculatedAt ? new Date(r.lastCalculatedAt).toLocaleString() : "-"}</td>
                    <td style={{ padding: 12 }}>
                      {requiresManualReview && <span style={{ color: "#b91c1c", fontWeight: 800 }}>Requires review</span>}
                      {shouldAutoSuspend && <div style={{ color: "#991b1b", fontWeight: 800 }}>Auto-suspend recommended</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
