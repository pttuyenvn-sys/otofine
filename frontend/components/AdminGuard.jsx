"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminToken, getAdminAuth } from "@/lib/auth/storage";

export default function AdminGuard({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getAdminToken();
    const auth = getAdminAuth();
    if (!token || !auth) {
      router.replace("/admin/login");
      return;
    }
    if (auth.role !== "admin") {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="main-content" style={{ padding: 24 }}>
        Đang kiểm tra đăng nhập…
      </div>
    );
  }

  return children;
}
