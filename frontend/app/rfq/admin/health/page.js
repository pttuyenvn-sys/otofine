"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { API_BASE } from "@/lib/config";

export default function RfqAdminHealthPage() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    const auth = localStorage.getItem("auth");
    if (!token) {
      setMsg("Đăng nhập admin (/admin/login) để xem.");
      return;
    }
    let role = null;
    try {
      role = auth ? JSON.parse(auth).role : null;
    } catch {
      /* ignore */
    }
    if (role !== "admin") {
      setMsg("Cần tài khoản admin (JWT role=admin).");
      return;
    }
    axios
      .get(`${API_BASE}/admin/rfq/health`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setData(res.data))
      .catch(() => setMsg("403/404 — RFQ_MODULE_ENABLED hoặc quyền admin."));
  }, []);

  return (
    <div className="rfq-admin-health">
      <h1>RFQ · vận hành</h1>
      <p className="muted">Queue Zalo, funnel 24h, backlog SLA — chỉ đọc.</p>
      {msg && <p className="rfq-banner-error">{msg}</p>}
      <pre className="rfq-admin-json">{data ? JSON.stringify(data, null, 2) : "Đang tải…"}</pre>
      <p className="muted">
        <Link href="/rfq/shop/inbox">Seller inbox</Link>
      </p>
    </div>
  );
}
