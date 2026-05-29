"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    href: "/admin/governance",
    label: "Governance",
    icon: "🏛️",
  },
  {
    href: "/admin/shops",
    label: "Shops",
    icon: "🏪",
  },
  {
    href: "/admin/products/moderation",
    label: "Product Moderation",
    icon: "🗂️",
  },
  {
    href: "/admin/enforcement",
    label: "Enforcement",
    icon: "🛡️",
  },
  {
    href: "/admin/risk-flags",
    label: "Risk Flags",
    icon: "🚨",
  },
  {
    href: "/admin/audit",
    label: "Audit",
    icon: "📜",
  },
  {
    href: "/admin/sessions",
    label: "Sessions",
    icon: "🔐",
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 260,
        minHeight: "100vh",
        background: "#111827",
        color: "white",
        padding: 20,
      }}
    >
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          Otofine
        </div>

        <div style={{ opacity: 0.7 }}>
          Governance Console
        </div>
      </div>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                textDecoration: "none",
                color: "white",
                background: active
                  ? "#2563eb"
                  : "transparent",
              }}
            >
              <span style={{ marginRight: 10 }}>
                {item.icon}
              </span>

              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
