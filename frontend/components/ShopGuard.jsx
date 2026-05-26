"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buildShopLoginUrl, getCurrentShopReturnPath } from "@/lib/auth/safeShopRedirect";

export default function ShopGuard({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const authStr = localStorage.getItem("auth");
    const loginUrl = buildShopLoginUrl(getCurrentShopReturnPath());

    if (!token || !authStr) {
      router.replace(loginUrl);
      return;
    }

    try {
      const auth = JSON.parse(authStr);
      if (auth.role !== "shop") {
        router.replace(loginUrl);
        return;
      }
    } catch {
      router.replace(loginUrl);
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
