"use client";

/**
 * Storefront → Seller-center shortcut.
 *
 * Renders a compact floating "Quản lý shop" chip on the storefront ONLY
 * when the visitor is authenticated as the owner of THIS shop. A
 * dropdown opens the seller workspace entry points (Shop / Sản phẩm /
 * Khách hàng / Hiệu quả / Tài khoản). For all other visitors the
 * component renders `null` so the storefront chrome stays customer-
 * first.
 *
 * Ownership check is client-only by design:
 *   - The chip itself only links into the seller workspace, which is
 *     already protected by ShopGuard / requireAuth — a non-owner who
 *     spoofs `shopId` in localStorage just gets a 401/403 from the
 *     real seller APIs.
 *   - The check is purely UX (don't show seller controls to customers),
 *     not a security boundary.
 *   - Keeping it client-only means SSR/SEO stay identical for everyone
 *     (no per-request auth branching that could leak into the cached
 *     HTML).
 *
 * Storefront SEO/canonical behaviour is preserved: the SSR tree never
 * renders this chip; it mounts only after hydration.
 */

import { useEffect, useRef, useState } from "react";
import { jwtDecode } from "jwt-decode";

const MENU_ITEMS = [
  { key: "shop",     icon: "🏪", label: "Shop",       href: "/shop/settings" },
  { key: "products", icon: "📦", label: "Sản phẩm",   href: "/shop/products" },
  { key: "inbox",    icon: "💬", label: "Khách hàng", href: "/rfq/shop/inbox" },
  { key: "insights", icon: "📊", label: "Hiệu quả",   href: "/shop/insights" },
  { key: "account",  icon: "👤", label: "Tài khoản",  href: "/shop/account" },
];

function readOwnerState(shopId) {
  try {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
    if (!token) return { isOwner: false };
    const decoded = jwtDecode(token);
    if (!decoded || decoded.role !== "shop") return { isOwner: false };
    if (!decoded.shopId || !shopId) return { isOwner: false };
    return { isOwner: String(decoded.shopId) === String(shopId) };
  } catch {
    return { isOwner: false };
  }
}

export default function StorefrontSellerShortcut({ shopId, sellerCenterHref = "/shop/settings" }) {
  const [isOwner, setIsOwner] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function recompute() {
      setIsOwner(readOwnerState(shopId).isOwner);
    }
    recompute();
    window.addEventListener("storage", recompute);
    window.addEventListener("auth-changed", recompute);
    return () => {
      window.removeEventListener("storage", recompute);
      window.removeEventListener("auth-changed", recompute);
    };
  }, [shopId]);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (!isOwner) return null;

  return (
    <div
      ref={ref}
      className="storefront-seller-shortcut"
      data-open={open ? "true" : "false"}
      aria-label="Quản lý shop"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="storefront-seller-shortcut__chip"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="storefront-seller-shortcut__chip-icon" aria-hidden>⚙️</span>
        <span className="storefront-seller-shortcut__chip-label">Quản lý shop</span>
        <span className="storefront-seller-shortcut__chip-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div role="menu" className="storefront-seller-shortcut__menu">
          <div className="storefront-seller-shortcut__menu-header">
            <span className="storefront-seller-shortcut__badge" aria-hidden>SELLER</span>
            <span className="storefront-seller-shortcut__menu-title">Bạn là chủ shop này</span>
            <span className="storefront-seller-shortcut__menu-sub">
              Chuyển nhanh sang Seller Center.
            </span>
          </div>
          <ul className="storefront-seller-shortcut__list">
            {MENU_ITEMS.map((it) => (
              <li key={it.key}>
                <a
                  href={it.href}
                  className="storefront-seller-shortcut__item"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  <span className="storefront-seller-shortcut__item-icon" aria-hidden>{it.icon}</span>
                  <span className="storefront-seller-shortcut__item-label">{it.label}</span>
                </a>
              </li>
            ))}
          </ul>
          <a
            href={sellerCenterHref}
            className="storefront-seller-shortcut__primary"
            onClick={() => setOpen(false)}
          >
            Mở Seller Center
          </a>
        </div>
      )}
    </div>
  );
}
