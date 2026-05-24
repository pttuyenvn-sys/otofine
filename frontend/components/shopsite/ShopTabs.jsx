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
 * `basePath` is the URL prefix this shop owns (e.g. "/shop-demo" or
 * "/shops/cuahangoto355"). Hard-coding it removed in Phase 2 so the
 * same component renders for both the hardcoded demo (Phase 1) and
 * every DB-backed shop slug (Phase 2).
 */
export default function ShopTabs({ basePath = "/shop-demo" }) {
  const pathname = usePathname() || basePath;
  const TABS = TAB_SUFFIXES.map((t) => ({
    href: `${basePath}${t.suffix}`,
    label: t.label,
  }));
  return (
    <nav
      aria-label="Điều hướng cửa hàng"
      className="bg-white rounded-2xl shadow-sm overflow-x-auto"
    >
      <ul className="flex items-stretch px-2 sm:px-4 min-w-max">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href} className="relative">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`block px-4 sm:px-5 py-3 sm:py-4 text-sm sm:text-base font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "text-[#e60012]"
                    : "text-gray-700 hover:text-[#e60012]"
                }`}
              >
                {tab.label}
              </Link>
              {active && (
                <span
                  aria-hidden
                  className="absolute left-3 right-3 bottom-0 h-[3px] bg-[#e60012] rounded-t-full"
                />
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
