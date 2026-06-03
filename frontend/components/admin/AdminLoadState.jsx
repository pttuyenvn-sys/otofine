"use client";

/**
 * Shared loading / unavailable / empty states for admin console pages.
 */

export function AdminLoadingState({ message = "Loading..." }) {
  return (
    <div
      style={{
        background: "white",
        padding: 24,
        borderRadius: 16,
        border: "1px solid #e5e7eb",
      }}
    >
      {message}
    </div>
  );
}

export function AdminErrorState({ title = "Unavailable", message, onRetry }) {
  if (!message) return null;

  return (
    <div
      style={{
        background: "#fef2f2",
        color: "#991b1b",
        padding: 24,
        borderRadius: 16,
        border: "1px solid #fecaca",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <div style={{ lineHeight: 1.5 }}>{message}</div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 16,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #fca5a5",
            background: "white",
            color: "#991b1b",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function AdminEmptyState({ title, message }) {
  return (
    <div
      style={{
        background: "white",
        padding: 32,
        borderRadius: 16,
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ opacity: 0.7, lineHeight: 1.5 }}>{message}</div>
    </div>
  );
}
