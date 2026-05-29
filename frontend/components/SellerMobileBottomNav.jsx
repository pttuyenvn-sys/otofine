"use client";

/**
 * Seller-center mobile bottom navigation.
 *
 * Goals:
 *   - 4 destinations: Shop / Sản phẩm / Khách hàng / Tài khoản.
 *   - Phone-only (<900px). The desktop sidebar remains the canonical
 *     nav; this bar is a complement, not a replacement.
 *   - Always reachable on every seller-context page, including
 *     /rfq/shop/inbox which lives under the RFQ layout (i.e. AppShell
 *     is hidden there). Mounted at the root layout level so it
 *     attaches to <body>, not the seller chrome.
 *   - Safe-area aware: respects iOS / Android home-bar inset.
 *   - Visibility is path-driven AND auth-driven; never appears for
 *     buyers, marketing pages, or unauthenticated visitors.
 *
 * Why not extend AppShell?
 *   AppShell hides on /rfq/* (the storefront RFQ inbox lives there)
 *   and on a few marketing routes. The bottom nav has different
 *   visibility rules, so it owns its own gate.
 *
 * Implementation notes:
 *   - SSR safe — `usePathname` is the only client API used.
 *   - The unread badge for "Khách hàng" reuses the same
 *     `useShopInboxSummaryBadge` hook that powers the sidebar badge,
 *     so the two are always in sync.
 *   - Active-state matches on prefix so deep links into product
 *     edit popups, settings tabs, etc. keep the right tab lit.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShopInboxSummaryBadge } from "@/hooks/useShopInboxSummaryBadge";
import { getShopToken, getShopAuth } from "@/lib/auth/storage";

// Paths where the bottom nav should appear. We DO NOT show it on
// /shop/login, /shop/register, etc.; those routes also fall inside
// AppShell's NO_LAYOUT set.
const SHOWN_PREFIXES = [
  "/shop/settings",
  "/shop/products",
  "/shop/account",
  "/shop/change-password",
  "/shop/add-product",
  "/shop/insights",
  "/rfq/shop/inbox",
  "/rfq/shop/", // legacy /rfq/shop/[dispatchId]
];

// Paths where we explicitly hide even if a prefix above matched.
// (none today, but reserving the negative gate so callers don't have
// to rebuild the visibility regex.)
const HIDDEN_PREFIXES = ["/shop/login", "/shop/register", "/shop/forgot-password", "/shop/reset-password"];

function shouldShow(pathname) {
  if (!pathname) return false;
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return false;
  }
  return SHOWN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function isActive(pathname, item) {
  if (!pathname) return false;
  if (item.match) return item.match.some((p) => pathname === p || pathname.startsWith(p));
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function NavBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-label={`${count} thông báo chưa đọc`}
      className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold inline-flex items-center justify-center leading-none"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function SellerMobileBottomNav() {
  const pathname = usePathname() || "";
  const [authed, setAuthed] = useState(false);

  // Auth gate is client-only — server cannot read localStorage. We
  // start with `authed=false` so SSR renders nothing; after hydration
  // we flip on if the seller token is present. Keeps SEO/SSR clean
  // for any future static-rendered route that slips a `/shop/*`
  // prefix in.
  useEffect(() => {
    function check() {
      try {
        const tok = getShopToken();
        const raw = getShopAuth();
        if (!tok || !raw) {
          setAuthed(false);
          return;
        }
        const a = raw;
        setAuthed(a?.role === "shop");
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

  // Badge hook also bails when authed=false (no token → no fetch).
  const { unread } = useShopInboxSummaryBadge({ enabled: authed });

  if (!authed || !shouldShow(pathname)) return null;

  const items = [
    { key: "shop",     icon: "🏪", label: "Shop",       href: "/shop/settings",
      match: ["/shop/settings"] },
    { key: "products", icon: "📦", label: "Sản phẩm",   href: "/shop/products",
      match: ["/shop/products", "/shop/add-product"] },
    { key: "inbox",    icon: "💬", label: "Khách hàng", href: "/rfq/shop/inbox",
      match: ["/rfq/shop"] },
    { key: "account",  icon: "👤", label: "Tài khoản",  href: "/shop/account",
      match: ["/shop/account", "/shop/change-password"] },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Seller mobile navigation"
      className="seller-mobile-bottom-nav"
    >
      <ul>
        {items.map((it) => {
          const active = isActive(pathname, it);
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={active ? "is-active" : ""}
              >
                <span className="icon" aria-hidden>{it.icon}</span>
                <span className="label">{it.label}</span>
                {it.key === "inbox" && <NavBadge count={unread} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
