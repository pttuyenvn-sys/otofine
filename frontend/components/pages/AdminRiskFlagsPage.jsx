"use client";

import { useEffect, useState } from "react";
import { getEnforcementRiskFlags } from "@/lib/adminApi";
import { formatAdminApiError } from "@/lib/adminApiErrors";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/AdminLoadState";

function SeverityBadge({ severity }) {
  const theme = (() => {
    switch (severity) {
      case "critical":
        return { bg: "#fee2e2", fg: "#991b1b" };
      case "high":
        return { bg: "#ffedd5", fg: "#7c2d12" };
      case "medium":
        return { bg: "#fef3c7", fg: "#92400e" };
      default:
        return { bg: "#ecfdf5", fg: "#065f46" };
    }
  })();

  return (
    <span
      style={{
        background: theme.bg,
        color: theme.fg,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        textTransform: "uppercase",
      }}
    >
      {severity || "low"}
    </span>
  );
}

export default function AdminRiskFlagsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadState, setLoadState] = useState("loading");

  async function load() {
    try {
      setLoading(true);
      setError("");
      setLoadState("loading");
      const res = await getEnforcementRiskFlags({ limit: 100 });
      const flags = res.data?.flags || [];
      setRows(flags);
      setLoadState(flags.length ? "ready" : "empty");
    } catch (err) {
      console.error(err);
      setRows([]);
      setError(formatAdminApiError(err, {
        module: "risk-flags",
        permissionDenied: "You do not have permission to view risk flags (risk:read).",
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
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Risk Flags</h1>
        <div style={{ opacity: 0.7, lineHeight: 1.5 }}>
          Enforcement risk signals from <code>/api/admin/enforcement/risk-flags</code>.
          Requires ADMIN_MODERATION_ENABLED and ADMIN_RISK_ENGINE_ENABLED.
        </div>
      </div>

      {loading && <AdminLoadingState message="Loading risk flags..." />}
      {!loading && loadState === "error" && (
        <AdminErrorState title="Risk flags unavailable" message={error} onRetry={load} />
      )}
      {!loading && loadState === "empty" && (
        <AdminEmptyState
          title="No risk flags"
          message="The risk engine is reachable, but no flags match the current filters."
        />
      )}

      {!loading && loadState === "ready" && (
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            overflow: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["ID", "Target", "Flag", "Severity", "Status", "Detected", "Case"].map(
                  (label) => (
                    <th
                      key={label}
                      style={{
                        textAlign: "left",
                        padding: 12,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        opacity: 0.7,
                      }}
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((flag) => (
                <tr key={flag.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 12, fontWeight: 700 }}>#{flag.id}</td>
                  <td style={{ padding: 12 }}>
                    {flag.target_type} #{flag.target_id}
                  </td>
                  <td style={{ padding: 12 }}>{flag.flag_type}</td>
                  <td style={{ padding: 12 }}>
                    <SeverityBadge severity={flag.severity} />
                  </td>
                  <td style={{ padding: 12 }}>{flag.status}</td>
                  <td style={{ padding: 12 }}>
                    {flag.detected_at
                      ? new Date(flag.detected_at).toLocaleString()
                      : "-"}
                  </td>
                  <td style={{ padding: 12 }}>{flag.case_id ? `#${flag.case_id}` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
