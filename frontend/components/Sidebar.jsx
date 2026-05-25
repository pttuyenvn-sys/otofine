"use client";

/**
 * Seller-center sidebar.
 *
 * Refinement pass — seller nav simplification + metrics overview:
 *   - Removed the standalone "+ Add Product" entry. Product creation
 *     still lives on /shop/products (popup), so the function is not
 *     lost; the sidebar simply stops duplicating it.
 *   - Added "Tin nhắn khách hàng" as a first-class destination so the
 *     seller can jump straight from any settings tab into the RFQ
 *     inbox. The unread badge polls the existing inbox-summary
 *     endpoint at 60s (see `useShopInboxSummaryBadge`).
 *
 * The visual style is intentionally unchanged — same `.sidebar`,
 * `.brand`, `.nav` / `.active` classes used by every seller page.
 * Only the badge `.sidebar-badge` is new and styled inline so the
 * change is fully contained in this file.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShopInboxSummaryBadge } from "@/hooks/useShopInboxSummaryBadge";

function Badge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-label={`${count} thông báo chưa đọc`}
      style={{
        marginLeft: "auto",
        minWidth: 22,
        height: 22,
        padding: "0 7px",
        borderRadius: 11,
        background: "#dc2626",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname() || "";
  const { unread } = useShopInboxSummaryBadge();

  const itemClass = (href) =>
    pathname === href || pathname.startsWith(href + "/")
      ? "active"
      : "";

  return (
    <aside className="sidebar" style={{ minHeight: "100vh", paddingTop: 20 }}>
      <div className="brand">
        <div className="logo">OF</div>
        <div>
          <div className="title">Otofine</div>
          <div style={{ fontSize: 12, color: "#a7d8c9" }}>Seller Center</div>
        </div>
      </div>

      <nav className="nav" style={{ marginTop: 12 }}>
        <Link href="/shop/settings" className={itemClass("/shop/settings")} prefetch={false}>
          🏬 <span style={{ marginLeft: 8 }}>Shop & Storefront</span>
        </Link>

        <Link href="/shop/products" className={itemClass("/shop/products")} prefetch={false}>
          📦 <span style={{ marginLeft: 8 }}>Products</span>
        </Link>

        <Link href="/rfq/shop/inbox" className={itemClass("/rfq/shop/inbox")} prefetch={false}>
          💬 <span style={{ marginLeft: 8 }}>Tin nhắn khách hàng</span>
          <Badge count={unread} />
        </Link>
      </nav>
    </aside>
  );
}
