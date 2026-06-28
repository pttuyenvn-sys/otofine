"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Crawlable year-range cross-links for marketplace listing pages.
 */
export default function ListingYearRangeLinks({ section }) {
  const pathname = usePathname();

  if (!section?.links?.length) return null;

  const normalizedPath = String(pathname || "")
    .trim()
    .toLowerCase()
    .replace(/\/$/, "") || "/";

  return (
    <nav
      className="listing-year-range-links"
      aria-label={section.title}
    >
      <h2 className="listing-year-range-links__title">{section.title}</h2>
      <ul className="listing-year-range-links__list">
        {section.links.map((item) => {
          const href = String(item.href || "").trim();
          const linkPath = href.toLowerCase().replace(/\/$/, "") || "/";
          const isActive = normalizedPath === linkPath;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                className={
                  isActive
                    ? "listing-year-range-links__chip listing-year-range-links__chip--active"
                    : "listing-year-range-links__chip"
                }
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
