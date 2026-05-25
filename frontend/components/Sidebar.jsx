"use client";

/**
 * Seller-center desktop sidebar.
 *
 * Unified seller IA pass — the navigation now mirrors the mobile bottom
 * nav 1:1 (Shop / Sản phẩm / Khách hàng / Tài khoản) plus a 5th
 * "Hiệu quả" destination that mobile reaches via the Account hub.
 * Same icons, same route ownership, same order — sellers carry a
 * single mental model across desktop, tablet and phone.
 *
 * The footer adds two ambient shortcuts:
 *   - "Mở storefront" → opens the seller's own public storefront in a
 *     new tab so they can verify edits without leaving the workspace.
 *   - "Đổi mật khẩu" / "Đăng xuất" stay in the Topbar dropdown to
 *     keep the sidebar lean.
 *
 * Visibility rules are intentionally NOT changed — AppShell still
 * decides when the sidebar mounts, and mobile (<900px) still hides it
 * via `globals.css`.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShopInboxSummaryBadge } from "@/hooks/useShopInboxSummaryBadge";
import useSellerStorefrontUrl from "@/hooks/useSellerStorefrontUrl";

const NAV_ITEMS = [
  {
    key: "shop",
    href: "/shop/settings",
    icon: "🏪",
    label: "Shop",
    match: ["/shop/settings", "/shop/public-page"],
  },
  {
    key: "products",
    href: "/shop/products",
    icon: "📦",
    label: "Sản phẩm",
    match: ["/shop/products", "/shop/add-product"],
  },
  {
    key: "inbox",
    href: "/rfq/shop/inbox",
    icon: "💬",
    label: "Khách hàng",
    match: ["/rfq/shop"],
    badgeKey: "inbox",
  },
  {
    key: "insights",
    href: "/shop/insights",
    icon: "📊",
    label: "Hiệu quả",
    match: ["/shop/insights"],
  },
  {
    key: "account",
    href: "/shop/account",
    icon: "👤",
    label: "Tài khoản",
    match: ["/shop/account", "/shop/change-password"],
  },
];

function isActiveItem(pathname, item) {
  if (!pathname) return false;
  if (Array.isArray(item.match)) {
    return item.match.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
  }
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function NavBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span aria-label={`${count} thông báo chưa đọc`} className="sidebar-link-badge">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname() || "";
  const { unread } = useShopInboxSummaryBadge();
  const { url: storefrontUrl, slug: storefrontSlug, isLive } = useSellerStorefrontUrl();

  return (
    <aside className="sidebar" style={{ minHeight: "100vh", paddingTop: 20 }}>
      <div className="brand">
        <div className="logo">OF</div>
        <div>
          <div className="title">Otofine</div>
          <div className="sidebar-brand-sub">Seller Center</div>
        </div>
      </div>

      <nav className="sidebar-nav-group" aria-label="Seller navigation">
        {NAV_ITEMS.map((it) => {
          const active = isActiveItem(pathname, it);
          return (
            <Link
              key={it.key}
              href={it.href}
              prefetch={false}
              className={"sidebar-link" + (active ? " is-active" : "")}
              aria-current={active ? "page" : undefined}
            >
              <span className="sidebar-link__icon" aria-hidden>{it.icon}</span>
              <span className="sidebar-link__label">{it.label}</span>
              {it.badgeKey === "inbox" && <NavBadge count={unread} />}
            </Link>
          );
        })}
      </nav>

      {/* Footer — quick switch back to the public storefront. Hidden
          while we don't yet know the seller's slug. Opens in a new
          tab so the seller can flip between workspace + storefront
          without losing their place. */}
      <div className="sidebar-footer">
        {storefrontUrl ? (
          <a
            href={storefrontUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-footer-link"
            title={storefrontSlug ? `${storefrontSlug}.otofine.com` : "Mở storefront"}
          >
            <span aria-hidden>🌐</span>
            <span style={{ flex: 1, minWidth: 0 }}>Xem storefront</span>
            <span aria-hidden style={{ opacity: 0.7 }}>↗</span>
          </a>
        ) : null}
        {storefrontUrl && !isLive && (
          <span className="sidebar-footer-link__hint">
            Storefront đang ở chế độ nháp.
          </span>
        )}
      </div>
    </aside>
  );
}
