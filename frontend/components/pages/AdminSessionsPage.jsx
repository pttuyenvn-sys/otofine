"use client";

import { useEffect, useState } from "react";
import { getAdminSessions, revokeAdminSession } from "@/lib/adminApi";

function formatTime(value) {
  try {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString();
  } catch {
    return String(value);
  }
}

function DeviceCell({ deviceHint, userAgent }) {
  const text = deviceHint || userAgent || "-";
  return (
    <div style={{ maxWidth: 360 }}>
      <div style={{ fontWeight: 700, color: "#111827" }}>
        {deviceHint || "-"}
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {userAgent || "-"}
      </div>
    </div>
  );
}

export default function AdminSessionsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revokingId, setRevokingId] = useState(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await getAdminSessions();
      setRows(res.data?.rows || []);
    } catch (err) {
      console.error(err);
      const httpStatus = err?.response?.status;
      if (httpStatus === 404) {
        setError("Sessions endpoint is not available (platform disabled or not deployed).");
      } else if (httpStatus === 403) {
        setError("You do not have permission to view or manage sessions.");
      } else {
        setError(err?.response?.data?.error || err.message || "Failed to load sessions");
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRevoke(session) {
    if (!window.confirm(`Revoke session #${session.id} for ${session.adminEmail || `admin#${session.adminId}`}?`)) {
      return;
    }

    setRevokingId(session.id);
    try {
      await revokeAdminSession(session.id, { reason: "force_logout" });
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err?.response?.data?.error || err.message || "Failed to revoke session");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Sessions</h1>
        <div style={{ opacity: 0.7 }}>Active admin sessions and revocation controls</div>
      </div>

      {loading && (
        <div style={{ background: "white", padding: 24, borderRadius: 16 }}>
          Loading sessions...
        </div>
      )}

      {!loading && error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: 24, borderRadius: 16 }}>
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ background: "white", padding: 32, borderRadius: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>No active sessions</div>
          <div style={{ opacity: 0.7 }}>There are no currently active admin sessions.</div>
        </div>
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
                <th style={{ textAlign: "left", padding: 14 }}>Admin</th>
                <th style={{ textAlign: "left", padding: 14 }}>IP Address</th>
                <th style={{ textAlign: "left", padding: 14 }}>Device</th>
                <th style={{ textAlign: "left", padding: 14 }}>Created</th>
                <th style={{ textAlign: "left", padding: 14 }}>Last Activity</th>
                <th style={{ textAlign: "left", padding: 14, width: 120 }}>Status</th>
                <th style={{ textAlign: "left", padding: 14, width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const adminLabel = s.adminEmail || (s.adminId != null ? `admin#${s.adminId}` : "-");
                const lastActivity = s.lastUsedAt || s.createdAt;
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: 14, fontWeight: 700, color: "#111827" }}>{adminLabel}</td>
                    <td style={{ padding: 14 }}>{s.ipAddress || "-"}</td>
                    <td style={{ padding: 14 }}>
                      <DeviceCell deviceHint={s.deviceHint} userAgent={s.userAgent} />
                    </td>
                    <td style={{ padding: 14, whiteSpace: "nowrap" }}>{formatTime(s.createdAt)}</td>
                    <td style={{ padding: 14, whiteSpace: "nowrap" }}>{formatTime(lastActivity)}</td>
                    <td style={{ padding: 14 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "#dcfce7",
                          color: "#166534",
                          border: "1px solid #bbf7d0",
                          fontSize: 12,
                          fontWeight: 800,
                          textTransform: "uppercase",
                        }}
                      >
                        active
                      </span>
                    </td>
                    <td style={{ padding: 14 }}>
                      <button
                        onClick={() => handleRevoke(s)}
                        disabled={revokingId === s.id}
                        style={{
                          background: "#dc2626",
                          color: "white",
                          border: "none",
                          padding: "8px 12px",
                          borderRadius: 10,
                          cursor: revokingId === s.id ? "not-allowed" : "pointer",
                          fontWeight: 700,
                          fontSize: 13,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {revokingId === s.id ? "Revoking..." : "Revoke"}
                      </button>
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

