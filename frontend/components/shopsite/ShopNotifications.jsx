import { useEffect, useState } from "react";

export default function ShopNotifications() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/shop/notifications?limit=100", { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(data.rows || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (e) {
      console.error(e);
      setError("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markRead(id) {
    try {
      const res = await fetch(`/api/shop/notifications/${id}/read`, { method: "POST", credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e) {
      console.error(e);
      setError("Failed to mark read");
    }
  }

  return (
    <div style={{ background: "white", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Notifications</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Unread: <strong>{unreadCount}</strong></div>
      </div>
      {loading && <div>Loading...</div>}
      {error && <div style={{ color: "#991b1b" }}>{error}</div>}
      {!loading && !error && rows.length === 0 && <div style={{ opacity: 0.7 }}>No notifications</div>}
      {!loading && rows.map((n) => (
        <div key={n.id} style={{ borderTop: "1px solid #f3f4f6", paddingTop: 8, paddingBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>{n.title}</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>{n.body}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.6 }}>{new Date(n.createdAt).toLocaleString()}</div>
            {!n.isRead && <button type="button" onClick={() => markRead(n.id)} style={{ background: "#059669", color: "white", border: "none", padding: "6px 8px", borderRadius: 6 }}>Mark read</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

