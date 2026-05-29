import React from "react";

export default function ModerationQueueTabs({ value = "pending_review", onChange }) {
  const tabs = [
    { key: "all", label: "All Products" },
    { key: "pending_review", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "draft", label: "Draft" },
  ];

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange && onChange(t.key)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: active ? "1px solid #059669" : "1px solid #e5e7eb",
              background: active ? "#ecfccb" : "#fff",
              cursor: "pointer",
              fontWeight: active ? 700 : 600,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

