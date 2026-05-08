"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname() || "";

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
          🏬 <span style={{ marginLeft: 8 }}>Shop</span>
        </Link>

        <Link href="/shop/products" className={itemClass("/shop/products")} prefetch={false}>
          📦 <span style={{ marginLeft: 8 }}>Products</span>
        </Link>

        <Link href="/shop/add-product" className={itemClass("/shop/add-product")} prefetch={false}>
          ➕ <span style={{ marginLeft: 8 }}>Add Product</span>
        </Link>
      </nav>
    </aside>
  );
}
