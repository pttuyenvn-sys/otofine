"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buildShopLoginUrl, getCurrentShopReturnPath } from "@/lib/auth/safeShopRedirect";
import { getShopToken, getShopAuth } from "@/lib/auth/storage";

export default function ShopGuard({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getShopToken();
    const auth = getShopAuth();
    const loginUrl = buildShopLoginUrl(getCurrentShopReturnPath());

    if (!token || !auth) {
      router.replace(loginUrl);
      return;
    }

    if (auth.role !== "shop") {
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
