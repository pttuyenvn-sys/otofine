"use client";

import { useEffect, useState } from "react";
import { getAuditLog } from "@/lib/adminApi";
import { formatAdminApiError } from "@/lib/adminApiErrors";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/AdminLoadState";

function formatTime(iso) {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString();
  } catch {
    return iso;
  }
}

function computeSeverityFallback(action) {
  if (!action) return "info";
  if (action === "shop.suspend" || action === "shop.delete") return "critical";
  if (
    action.startsWith("rbac.") ||
    action.startsWith("risk.") ||
    action.startsWith("moderation.")
  ) {
    return "warning";
  }
  return "info";
}

function SeverityBadge({ severity }) {
  const theme = (() => {
    switch (severity) {
      case "critical":
        return { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca", label: "critical" };
      case "warning":
        return { bg: "#fef3c7", fg: "#92400e", border: "#fde68a", label: "warning" };
      case "info":
      default:
        return { bg: "#dbeafe", fg: "#1d4ed8", border: "#bfdbfe", label: "info" };
    }
  })();

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 10px",
        borderRadius: 999,
        background: theme.bg,
        color: theme.fg,
        border: `1px solid ${theme.border}`,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.2,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {theme.label}
    </span>
  );
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);

  // Filters (lightweight; Slice 3)
  const [severity, setSeverity] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await getAuditLog({
          page,
          limit,
          severity: severity || undefined,
          actor: actor || undefined,
          action: action || undefined,
        });
        const apiRows = res.data?.rows || [];

        if (!cancelled) {
          setRows(apiRows);
          setTotal(Number(res.data?.total ?? 0));
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setError(formatAdminApiError(err, {
            module: "audit",
            permissionDenied: "You do not have permission to view the audit log.",
          }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, limit, severity, actor, action]);

  const totalPages = Math.max(1, Math.ceil((total || 0) / limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Audit Timeline</h1>
        <div style={{ opacity: 0.7 }}>Administrative actions and governance events</div>
      </div>

      {/* Slice 3: Filters + pagination controls (lightweight) */}
      <div
        style={{
          background: "white",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          padding: 16,
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-end",
        }}
      >
        <div style={{ minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 6 }}>Severity</div>
          <select
            value={severity}
            onChange={(e) => {
              setPage(1);
              setSeverity(e.target.value);
            }}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "white",
            }}
          >
            <option value="">All</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </div>

        <div style={{ minWidth: 220, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 6 }}>Actor</div>
          <input
            value={actor}
            onChange={(e) => {
              setPage(1);
              setActor(e.target.value);
            }}
            placeholder="Search by email or admin id..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
            }}
          />
        </div>

        <div style={{ minWidth: 220, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 6 }}>Action</div>
          <input
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
            placeholder="Search action (e.g. shop.suspend, rbac.role.assign)..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
            }}
          />
        </div>

        <div style={{ minWidth: 140 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 6 }}>Limit</div>
          <select
            value={String(limit)}
            onChange={(e) => {
              setPage(1);
              setLimit(Number(e.target.value));
            }}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "white",
            }}
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, marginLeft: "auto", alignItems: "center" }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Page <strong>{page}</strong> / {totalPages}{" "}
            <span style={{ opacity: 0.8 }}>({total} total)</span>
          </div>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!canPrev || loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: !canPrev || loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            ← Prev
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!canNext || loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: !canNext || loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            Next →
          </button>
        </div>
      </div>

      {loading && <AdminLoadingState message="Loading audit log..." />}

      {!loading && error && (
        <AdminErrorState title="Audit log unavailable" message={error} />
      )}

      {!loading && !error && rows.length === 0 && (
        <AdminEmptyState
          title="No audit entries"
          message="The audit log API is reachable, but no administrative actions have been recorded yet."
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 14 }}>Time</th>
                <th style={{ textAlign: "left", padding: 14 }}>Actor</th>
                <th style={{ textAlign: "left", padding: 14 }}>Action</th>
                <th style={{ textAlign: "left", padding: 14 }}>Target</th>
                <th style={{ textAlign: "left", padding: 14, width: 140 }}>Severity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const actor = r.actorEmail || (r.adminId != null ? `admin#${r.adminId}` : r.actorType);
                const target =
                  r.targetType && r.targetId != null ? `${r.targetType}#${r.targetId}` : (r.targetType || "-");
                const severity = r.severity || computeSeverityFallback(r.action);
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: 14, whiteSpace: "nowrap" }}>{formatTime(r.createdAt)}</td>
                    <td style={{ padding: 14 }}>{actor}</td>
                    <td style={{ padding: 14, fontWeight: 700, color: "#111827" }}>{r.action}</td>
                    <td style={{ padding: 14 }}>{target}</td>
                    <td style={{ padding: 14 }}>
                      <SeverityBadge severity={severity} />
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

