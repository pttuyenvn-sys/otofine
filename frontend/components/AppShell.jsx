"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const NO_LAYOUT = new Set([
  "/",
  "/shop/login",
  "/shop/register",
  "/shop/forgot-password",
  "/admin/login",
  "/admin/forgot-password",
]);

export default function AppShell({ children }) {
  const pathname = usePathname() || "";
  const segments = pathname.split("/").filter(Boolean);
  /** Trang marketing một segment: /phu-tung-o-to, /den-o-to — không dùng shell shop */
  const isMarketingSingle =
    segments.length === 1 && !["shop", "admin"].includes(segments[0]);

  const hideLayout =
    NO_LAYOUT.has(pathname) ||
    pathname.startsWith("/rfq") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/product/") ||
    pathname.startsWith("/phu-tung/") ||
    pathname.startsWith("/p/") ||
    pathname === "/shop-demo" ||
    pathname.startsWith("/shop-demo/") ||
    pathname.startsWith("/shops/") ||
    isMarketingSingle;

  if (hideLayout) {
    return <>{children}</>;
  }

  return (
    <div className="app-root">
      <Sidebar />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          maxHeight: "100vh",
          overflow: "hidden",
        }}
      >
        <Topbar />
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
