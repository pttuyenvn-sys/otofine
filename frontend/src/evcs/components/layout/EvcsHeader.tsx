"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CtaButton } from "@evcs/components/conversion/CtaButton";
import { HotlineLink } from "@evcs/components/conversion/HotlineLink";
import { Logo } from "@evcs/components/primitives";
import { Container } from "@evcs/components/layout/Container";
import { MAIN_NAV } from "@evcs/constants/navigation";
import { EVCS_ROUTES } from "@evcs/constants/routes";
import { SITE } from "@evcs/constants/site";
import { isEvcsNavActive } from "@evcs/lib/evcsHost";
import { cn } from "@evcs/utils/cn";

export function EvcsHeader() {
  const pathname = usePathname() || "";
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="evcs-header">
      <Container>
        <div className="evcs-header__inner">
          <Link href={EVCS_ROUTES.home} className="evcs-header__brand">
            <Logo size="sm" showWordmark={false} />
            <div>
              <div className="evcs-header__name">{SITE.name}</div>
              <div className="evcs-header__tagline">{SITE.tagline}</div>
            </div>
          </Link>

          <nav className="evcs-header__nav" aria-label="Menu chính">
            {MAIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "evcs-header__nav-link",
                  isEvcsNavActive(pathname, item.href) &&
                    "evcs-header__nav-link--active",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="evcs-header__actions">
            <HotlineLink className="evcs-header__hotline" showIcon />
            <CtaButton variant="consult" size="sm" />
            <button
              type="button"
              className="evcs-header__menu-btn"
              aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              <span aria-hidden>{mobileOpen ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>
      </Container>

      <nav
        className={cn(
          "evcs-header__mobile-nav",
          mobileOpen && "evcs-header__mobile-nav--open",
        )}
        aria-label="Menu di động"
      >
        {MAIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="evcs-header__mobile-link"
            onClick={() => setMobileOpen(false)}
          >
            {item.label}
          </Link>
        ))}
        <HotlineLink className="evcs-header__mobile-link" />
      </nav>
    </header>
  );
}
