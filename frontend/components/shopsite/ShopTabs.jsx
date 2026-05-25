"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TAB_SUFFIXES = [
  { suffix: "", label: "Trang chủ" },
  { suffix: "/gioi-thieu", label: "Giới thiệu" },
  { suffix: "/san-pham", label: "Sản phẩm" },
  { suffix: "/lien-he", label: "Liên hệ" },
];

function isActive(pathname, href) {
  if (!pathname) return false;
  const norm = pathname.replace(/\/$/, "") || "/";
  const target = href.replace(/\/$/, "") || "/";
  if (norm === target) return true;
  return norm.startsWith(`${target}/`);
}

/**
 * `basePath` is the URL prefix this shop owns. Three regimes:
 *
 *   "/shop-demo"            → Phase 1 hardcoded demo
 *   "/shops/cuahangoto355"  → Phase 2 DB-backed on apex
 *   ""                      → Phase 3 served via *.otofine.com subdomain
 *                             (middleware rewrote the request, so the
 *                             tab hrefs need to be root-relative so the
 *                             browser URL stays on the subdomain).
 */
export default function ShopTabs({ basePath = "/shop-demo" }) {
  const pathname = usePathname() || basePath || "/";
  const TABS = TAB_SUFFIXES.map((t) => {
    const href = `${basePath}${t.suffix}` || "/";
    return { href, label: t.label };
  });
  return (
    // Phase 4 polish: tabs become sticky once the user scrolls past the
    // cover. `top-0` aligns to the viewport (no separate shop topnav
    // sits above them). Soft blur + opaque background ensures
    // readability over varying page bodies. `supports-[backdrop-filter]`
    // gracefully degrades to plain bg-white on Safari < 14.
    //
    // Mobile compression: total tab-strip height drops from ~56px
    // (py-3 + text-sm) to ~44px (py-2.5 + text-[13px]) to match the
    // iOS/Android nav-bar conventions. Underline animation + sticky
    // behaviour preserved untouched.
    <nav
      aria-label="Điều hướng cửa hàng"
      className="bg-white/95 supports-[backdrop-filter]:bg-white/80 supports-[backdrop-filter]:backdrop-blur rounded-xl sm:rounded-2xl shadow-sm overflow-x-auto sticky top-0 z-30 ring-1 ring-black/[0.03]"
    >
      <ul className="flex items-stretch px-1 sm:px-3 min-w-max">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href} className="relative">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`block px-3 sm:px-5 py-2.5 sm:py-4 text-[13px] sm:text-[15px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e60012]/40 rounded-md ${
                  active
                    ? "text-[#e60012]"
                    : "text-gray-700 hover:text-[#e60012]"
                }`}
              >
                {tab.label}
              </Link>
              <span
                aria-hidden
                className={`pointer-events-none absolute left-2 right-2 sm:left-3 sm:right-3 bottom-0 h-[2px] sm:h-[3px] rounded-t-full bg-[#e60012] origin-center transition-transform duration-200 ${
                  active ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
