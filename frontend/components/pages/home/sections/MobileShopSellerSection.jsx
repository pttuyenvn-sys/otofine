"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getShopAuth, getShopToken } from "@/lib/auth/storage";

export default function MobileShopSellerSection() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    function check() {
      try {
        const tok = getShopToken();
        const raw = getShopAuth();
        if (!tok || !raw) {
          setAuthed(false);
          return;
        }
        setAuthed(raw?.role === "shop");
      } catch {
        setAuthed(false);
      }
    }
    check();
    window.addEventListener("storage", check);
    window.addEventListener("auth-changed", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("auth-changed", check);
    };
  }, []);

  return (
    <div className="mobile-shop-seller">
      <h4 className="mobile-shop-seller__title">Dành cho Chủ Shop</h4>
      {authed ? (
        <ul className="mobile-shop-seller__list">
          <li>
            <Link href="/shop/products" className="mobile-shop-seller__link" prefetch={false}>
              Quản lý sản phẩm
            </Link>
          </li>
          <li>
            <Link href="/rfq/shop/inbox" className="mobile-shop-seller__link" prefetch={false}>
              Hộp thư RFQ
            </Link>
          </li>
          <li>
            <Link href="/shop/settings" className="mobile-shop-seller__link" prefetch={false}>
              Cài đặt Shop
            </Link>
          </li>
        </ul>
      ) : (
        <ul className="mobile-shop-seller__list">
          <li>
            <Link href="/shop/login" className="mobile-shop-seller__link" prefetch={false}>
              Đăng nhập Shop
            </Link>
          </li>
          <li>
            <Link href="/shop/register" className="mobile-shop-seller__link" prefetch={false}>
              Đăng ký Shop
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
