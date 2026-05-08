"use client";

import React from "react";

export default function PopularCategoriesBox({
  categories = [],
  onCtaClick,
  selectedCategory,
}) {
  if (!categories || categories.length === 0) return null;
  console.log("POPULAR COUNT:", categories.length);

  return (
    <div className="of-rail-card box-popular-cats" aria-label="Danh mục phổ biến">
      <h4 className="of-rail-card__h popular-cats-title">Danh mục phổ biến</h4>
      <p className="of-rail-links__p popular-cats-links">
        {categories.map((cat, index) => {
          const name =
            typeof cat === "string"
              ? cat
              : cat?.canonical_name ||
              cat?.category ||
              cat?.category_name ||
              cat?.name;

          const key =
            (typeof cat === "string" ? cat : cat?.canonical_slug) || name;

          if (!name) return null;

          return (
            <React.Fragment key={key}>
              {index > 0 && (
                <span className="of-rail-sep popular-cat-sep" aria-hidden>
                  {" "}
                  ·{" "}
                </span>
              )}
              <button
                type="button"
                onClick={() => onCtaClick?.(cat)}
                className="popular-cat-link"
                aria-pressed={selectedCategory === name}
              >
                {name}
              </button>
            </React.Fragment>
          );
        })}
      </p>
    </div>
  );
}