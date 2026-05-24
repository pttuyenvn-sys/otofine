"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/shop-demo", label: "Trang chủ" },
  { href: "/shop-demo/gioi-thieu", label: "Giới thiệu" },
  { href: "/shop-demo/san-pham", label: "Sản phẩm" },
  { href: "/shop-demo/lien-he", label: "Liên hệ" },
];

function isActive(pathname, href) {
  if (!pathname) return false;
  if (href === "/shop-demo") return pathname === "/shop-demo" || pathname === "/shop-demo/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ShopTabs() {
  const pathname = usePathname() || "/shop-demo";
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
