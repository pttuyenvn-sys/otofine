"use client";

/**
 * Seller account hub — mobile-first landing for the "Tài khoản" tab on
 * the new bottom nav. Intentionally minimal: identity + a short list
 * of account-scoped actions that sellers might otherwise hunt for
 * inside `/shop/settings` (which is now a long form on phones).
 *
 * Reuses existing routes / APIs only — no new endpoints. Logout uses
 * the same `localStorage.clear()` + auth-changed broadcast that the
 * Topbar dropdown has used since day one.
 *
 * Desktop also gets this page so deep links work, but it's primarily
 * tuned for mobile (the bottom nav is mobile-only).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSellerStorefrontUrl from "@/hooks/useSellerStorefrontUrl";
import { clearOwnerCookie } from "@/lib/auth/sellerOwnerCookie";

function Row({ href, icon, title, subtitle, danger = false, onClick, external = false }) {
  const content = (
    <span
      className={
        "flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl active:bg-gray-50 transition-colors " +
        (danger ? "text-red-600" : "text-gray-900")
      }
    >
      <span className="w-9 h-9 rounded-lg bg-gray-50 inline-flex items-center justify-center text-base shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">{title}</span>
        {subtitle && (
          <span className="block text-xs text-gray-500 mt-0.5 leading-tight truncate">
            {subtitle}
          </span>
        )}
      </span>
      <span className="text-gray-300 text-lg leading-none" aria-hidden>
        {external ? "↗" : "›"}
      </span>
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
      >
        {content}
      </button>
    );
  }
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={false} className="block">
      {content}
    </Link>
  );
}

export default function ShopAccount() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const { url: storefrontUrl, slug: storefrontSlug } = useSellerStorefrontUrl();

  useEffect(() => {
    try {
      const { getShopAuth } = require("@/lib/auth/storage");
      const raw = getShopAuth();
      if (raw) setEmail(raw.email || "");
    } catch {
      /* swallow */
    }
  }, []);

  function handleLogout() {
    try {
      const { removeShopToken, removeShopRefreshToken, removeShopAuth, removeShopId } = require("@/lib/auth/storage");
      removeShopToken();
      removeShopRefreshToken();
      removeShopAuth();
      removeShopId();
    } catch {
      try {
        const { removeShopToken, removeShopRefreshToken, removeShopAuth, removeShopId } = require("@/lib/auth/storage");
        removeShopToken();
        removeShopRefreshToken();
        removeShopAuth();
        removeShopId();
      } catch {
        /* swallow */
      }
    }
    // Also drop the cross-subdomain owner cookie so wildcard subdomains stop showing the admin chip.
    clearOwnerCookie();
    window.dispatchEvent(new Event("auth-changed"));
    router.replace("/shop/login");
  }

  return (
    <div className="main-content" style={{ padding: 0 }}>
      <div className="px-3 py-3 sm:px-6 sm:py-5 max-w-2xl mx-auto">
        <header className="mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Tài khoản</h1>
          <p className="text-sm text-gray-500 mt-1 truncate">
            {email || "Tài khoản shop"}
          </p>
        </header>

        <div className="space-y-2.5">
          <Row
            href="/shop/settings"
            icon="🏪"
            title="Shop"
            subtitle="Thông tin, storefront, liên hệ"
          />
          <Row
            href="/shop/products"
            icon="📦"
            title="Sản phẩm"
            subtitle="Quản lý danh sách phụ tùng"
          />
          <Row
            href="/rfq/shop/inbox"
            icon="💬"
            title="Khách hàng"
            subtitle="RFQ & hội thoại"
          />
          <Row
            href="/shop/insights"
            icon="📊"
            title="Hiệu quả"
            subtitle="Số liệu vận hành 30 ngày"
          />

          {storefrontUrl ? (
            <Row
              href={storefrontUrl}
              icon="🌐"
              title="Xem storefront"
              subtitle={storefrontSlug ? `${storefrontSlug}.otofine.com` : "Mở trang công khai"}
              external
            />
          ) : null}

          <Row
            href="/shop/change-password"
            icon="🔒"
            title="Đổi mật khẩu"
            subtitle="Bảo mật tài khoản"
          />
          <Row
            onClick={handleLogout}
            icon="🚪"
            title="Đăng xuất"
            danger
          />
        </div>

        <p className="text-[11px] text-gray-400 mt-6 text-center">
          Otofine Seller Center
        </p>
      </div>
    </div>
  );
}
