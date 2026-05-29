"use client";

/**
 * Seller-center topbar.
 *
 * Desktop (≥ 900px):
 *   - 64px height, inline padding 20px
 *   - `[Back]  Otofine Seller Center  ........  [avatar  email + role  ▾]`
 *   - Hovering the avatar chip reveals the dropdown menu (Settings,
 *     Products, Inbox, Logout for sellers; admin variants stay).
 *
 * Mobile (< 900px):
 *   - 56px height app-bar, side padding 12px.
 *   - `[← Back]  Otofine  ........  [avatar]`
 *   - The avatar chip drops the email/role copy that previously
 *     forced the topbar to wrap to 3+ lines on phones. Tapping the
 *     avatar opens the same dropdown.
 *
 * All routing / logout / auth-event behavior is unchanged — only the
 * presentational chrome was rebalanced for the mobile UX pass.
 */

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";
import { clearOwnerCookie } from "@/lib/auth/sellerOwnerCookie";
import { getShopToken, getShopAuth, getAdminToken, getAdminAuth, removeShopToken, removeShopRefreshToken, removeShopAuth, removeShopId, removeAdminToken, removeAdminAuth, removeAdminRefreshToken } from "@/lib/auth/storage";

export default function Topbar() {
  const [open, setOpen] = useState(false);
  const [auth, setAuth] = useState(null);
  const ref = useRef();
  const router = useRouter();

  useEffect(() => {
    function loadAuth() {
      // prefer shop auth, fall back to admin for topbar visibility
      const shopToken = getShopToken();
      const adminToken = getAdminToken();
      const token = shopToken || adminToken;
      if (!token) {
        setAuth(null);
        return;
      }

      try {
        const decoded = jwtDecode(token);
        let emailFromStorage = "";
        try {
          const rawShop = getShopAuth();
          const rawAdmin = getAdminAuth();
          const raw = rawShop || rawAdmin;
          if (raw) emailFromStorage = raw.email || "";
        } catch {
          /* ignore */
        }
        setAuth({
          ...decoded,
          email: decoded.email || emailFromStorage || "",
        });
      } catch {
        setAuth(null);
      }
    }

    loadAuth();

    window.addEventListener("storage", loadAuth);
    window.addEventListener("auth-changed", loadAuth);
    return () => {
      window.removeEventListener("storage", loadAuth);
      window.removeEventListener("auth-changed", loadAuth);
    };
  }, []);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  function handleLogout() {
    try {
      if (auth?.role === "admin") {
        removeAdminToken();
        removeAdminRefreshToken();
        removeAdminAuth();
        clearOwnerCookie();
        setAuth(null);
        setOpen(false);
        router.push("/admin/login");
        return;
      }
      // default: shop logout
      removeShopToken();
      removeShopRefreshToken();
      removeShopAuth();
      removeShopId();
      clearOwnerCookie();
      setAuth(null);
      setOpen(false);
      router.push("/shop/login");
    } catch {
      try {
        // best-effort remove namespaced keys only (do not wipe unrelated app storage)
        removeShopToken();
        removeShopRefreshToken();
        removeShopAuth();
        removeShopId();
        removeAdminToken();
        removeAdminRefreshToken();
        removeAdminAuth();
      } catch {}
      router.push("/shop/login");
    }
  }

  const email = (auth?.email || "").trim();
  const roleLabel =
    auth?.role === "admin"
      ? "Admin"
      : auth?.role === "shop"
        ? "Shop"
        : "Đăng nhập";
  const initial = (email || "U")[0]?.toUpperCase();

  return (
    <header className="seller-topbar">
      <div className="seller-topbar__left">
        <button
          type="button"
          className="seller-topbar__back"
          onClick={() => router.back()}
          aria-label="Quay lại"
        >
          <span className="seller-topbar__back-icon" aria-hidden>←</span>
          <span className="seller-topbar__back-label">Back</span>
        </button>
        <div className="seller-topbar__title">
          <span className="seller-topbar__title-short">Otofine</span>
          <span className="seller-topbar__title-full"> Seller Center</span>
        </div>
      </div>

      <div ref={ref} className="seller-topbar__account">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="seller-topbar__chip"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={email ? `Tài khoản ${email}` : "Tài khoản"}
        >
          <span className="seller-topbar__avatar" aria-hidden>
            {initial}
          </span>
          <span className="seller-topbar__chip-meta">
            <span className="seller-topbar__chip-email">
              {email || "Chưa đăng nhập"}
            </span>
            <span className="seller-topbar__chip-role">{roleLabel}</span>
          </span>
        </button>

        {open && (
          <div className="seller-topbar__menu" role="menu">
            {auth?.role === "admin" && (
              <>
                <Link href="/admin/shops" className="seller-topbar__menu-item" prefetch={false}>
                  Quản lý Shop
                </Link>
                <button
                  type="button"
                  className="seller-topbar__menu-item"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </>
            )}

            {auth?.role === "shop" && (
              <>
                <Link href="/shop/settings" className="seller-topbar__menu-item" prefetch={false}>
                  Shop Settings
                </Link>
                <Link href="/shop/products" className="seller-topbar__menu-item" prefetch={false}>
                  Products
                </Link>
                {/* Sidebar parity — the seller sidebar is hidden under
                    900px, so the topbar dropdown must surface every
                    primary destination on mobile (including the new
                    inbox entry added in the nav refinement pass). */}
                <Link href="/rfq/shop/inbox" className="seller-topbar__menu-item" prefetch={false}>
                  Tin nhắn khách hàng
                </Link>
                <button
                  type="button"
                  className="seller-topbar__menu-item"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </>
            )}

            {!auth && (
              <>
                <Link href="/shop/login" className="seller-topbar__menu-item" prefetch={false}>
                  Shop Login
                </Link>
                <Link href="/shop/register" className="seller-topbar__menu-item" prefetch={false}>
                  Shop Register
                </Link>
                <Link href="/admin/login" className="seller-topbar__menu-item" prefetch={false}>
                  Admin Login
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
