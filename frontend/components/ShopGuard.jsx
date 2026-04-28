"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ShopGuard({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const authStr = localStorage.getItem("auth");

    if (!token || !authStr) {
      router.replace("/shop/login");
      return;
    }

    try {
      const auth = JSON.parse(authStr);
      if (auth.role !== "shop") {
        router.replace("/shop/login");
        return;
      }
    } catch {
      router.replace("/shop/login");
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
