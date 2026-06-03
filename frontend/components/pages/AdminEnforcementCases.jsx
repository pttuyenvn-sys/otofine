"use client";

import { useEffect, useState } from "react";
import { getEnforcementCases } from "@/lib/adminApi";
import { formatAdminApiError } from "@/lib/adminApiErrors";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/AdminLoadState";

export default function AdminEnforcementCases() {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState([]);
  const [error, setError] = useState("");
  const [loadState, setLoadState] = useState("loading");

  async function loadCases() {
    try {
      setLoading(true);
      setError("");
      setLoadState("loading");

      const response = await getEnforcementCases();
      const next = response.data?.cases || [];
      setCases(next);
      setLoadState(next.length ? "ready" : "empty");
    } catch (err) {
      console.error(err);
      setCases([]);
      setError(formatAdminApiError(err, {
        module: "enforcement",
        permissionDenied: "You do not have permission to view enforcement cases.",
      }));
      setLoadState("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCases();
  }, []);

  return (
    <div>
      <div
        style={{
          marginBottom: 24,
        }}
      >
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Enforcement Cases
        </h1>

        <div
          style={{
            opacity: 0.7,
          }}
        >
          Governance enforcement and moderation operations
        </div>
      </div>

      {loading && (
        <AdminLoadingState message="Loading enforcement cases..." />
      )}

      {!loading && loadState === "error" && (
        <AdminErrorState
          title="Enforcement unavailable"
          message={error}
          onRetry={loadCases}
        />
      )}

      {!loading && loadState === "empty" && (
        <AdminEmptyState
          title="No enforcement cases"
          message="The enforcement API is reachable, but no cases exist yet."
        />
      )}

      {!loading && loadState === "ready" && (
        <div
          style={{
            display: "grid",
            gap: 16,
          }}
        >
          {cases.map((item) => (
            <div
              key={item.id}
              style={{
                background: "white",
                padding: 20,
                borderRadius: 16,
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 18,
                  }}
                >
                  Case #{item.id}
                </div>

                <div
                  style={{
                    background: "#dbeafe",
                    color: "#1d4ed8",
                    padding: "6px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {item.status}
                </div>
              </div>

              <div
                style={{
                  marginBottom: 8,
                }}
              >
                Shop ID: {item.shop_id}
              </div>

              <div
                style={{
                  opacity: 0.7,
                }}
              >
                {item.reason || "No reason provided"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
