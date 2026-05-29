"use client";

import { useEffect, useState } from "react";
import { getEnforcementCases } from "@/lib/adminApi";

export default function AdminEnforcementCases() {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState([]);
  const [error, setError] = useState("");

  async function loadCases() {
    try {
      setLoading(true);
      setError("");

      const response = await getEnforcementCases();

      setCases(response.data?.cases || []);
    } catch (err) {
      console.error(err);

      setError(
        err?.response?.data?.message ||
        "Failed to load enforcement cases"
      );
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
        <div
          style={{
            background: "white",
            padding: 24,
            borderRadius: 16,
          }}
        >
          Loading enforcement cases...
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: 24,
            borderRadius: 16,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && cases.length === 0 && (
        <div
          style={{
            background: "white",
            padding: 32,
            borderRadius: 16,
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            No enforcement cases
          </div>

          <div
            style={{
              opacity: 0.7,
            }}
          >
            No moderation or enforcement actions exist yet.
          </div>
        </div>
      )}

      {!loading && !error && cases.length > 0 && (
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
