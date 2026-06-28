"use client";

import React, { useMemo, useState } from "react";

const CATEGORIES_INITIAL = 12;

export default function PopularCategoriesSection({
  categories = [],
  selectedCategory,
  onCategoryClick,
  onCtaClick,
  variant = "desktop",
  className = "",
  initialLimit = CATEGORIES_INITIAL,
}) {
  const [expanded, setExpanded] = useState(false);
  const handleClick = onCategoryClick || onCtaClick;

  const sorted = useMemo(
    () =>
      [...categories].sort(
        (a, b) =>
          (b.total_product_count || b.product_count || 0) -
          (a.total_product_count || a.product_count || 0),
      ),
    [categories],
  );

  if (!Array.isArray(categories) || categories.length === 0) return null;

  const visible = expanded ? sorted : sorted.slice(0, initialLimit);
  const hasMore = sorted.length > initialLimit;

  if (!visible.length) return null;

  if (variant === "mobile") {
    return (
      <div
        className={[
          "of-rail-links",
          "of-rail-links--mobile",
          "of-rail-cats--mobile",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Danh mục phổ biến"
      >
        <h4 className="of-rail-card__h">Danh mục phổ biến</h4>
        <ul className="of-rail-links__list">
          {visible.map((cat) => {
            const slug = cat.canonical_slug || cat.category_slug;
            const isActive = selectedCategory === slug;
            return (
              <li key={slug || cat.canonical_name}>
                <button
                  type="button"
                  className={`of-rail-link of-rail-link--muted of-rail-link--block${isActive ? " is-active" : ""}`}
                  onClick={() => handleClick?.(cat)}
                  aria-pressed={isActive}
                >
                  {cat.canonical_name || cat.category_name || cat.name}
                </button>
              </li>
            );
          })}
        </ul>
        {hasMore && !expanded ? (
          <button
            type="button"
            className="of-rail-more"
            onClick={() => setExpanded(true)}
          >
            Xem thêm →
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`box-popular-cats popular-cats${className ? ` ${className}` : ""}`}
      aria-label="Danh mục phổ biến"
    >
      <h4 className="popular-cats-title popular-cats__h">Danh mục phổ biến</h4>
      <ul className="popular-cats-chips popular-cats__list" role="list">
        {visible.map((cat) => {
          const slug = cat.canonical_slug || cat.category_slug;
          const isActive = selectedCategory === slug;
          return (
            <li key={slug || cat.canonical_name}>
              <button
                type="button"
                className={`popular-cat-link popular-cats__pill${isActive ? " is-active" : ""}`}
                onClick={() => handleClick?.(cat)}
                aria-pressed={isActive}
              >
                {cat.canonical_name || cat.category_name || cat.name}
              </button>
            </li>
          );
        })}
      </ul>
      {hasMore && !expanded ? (
        <button
          type="button"
          className="of-rail-more"
          onClick={() => setExpanded(true)}
        >
          Xem thêm →
        </button>
      ) : null}
    </div>
  );
}
