 "use client";
import { removeAdminToken, removeAdminAuth, removeAdminRefreshToken } from "@/lib/auth/storage";

export default function AdminTopbar() {
  async function handleLogout() {
    try {
      // remove admin namespaced keys
      removeAdminToken();
      removeAdminAuth();
      removeAdminRefreshToken();
    } catch {}

    window.location.href = "/admin/login";
  }

  return (
    <header
      style={{
        height: 72,
        background: "white",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          Governance Console
        </div>

        <div
          style={{
            fontSize: 13,
            opacity: 0.6,
          }}
        >
          Administrative Operations
        </div>
      </div>

      <button
        onClick={handleLogout}
        style={{
          background: "#dc2626",
          color: "white",
          border: "none",
          padding: "10px 16px",
          borderRadius: 10,
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Logout
      </button>
    </header>
  );
}
