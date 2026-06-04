import React from "react";
import { SearchSuggestThumb } from "@/components/pages/home/HomeImages";

export default function SearchSuggestPanel({
  isMobile,
  searchAssistId,
  suggestItems = [],
  onProductClick,
  categorySuggestions = [],
  onCategoryClick,
}) {
  return (
    <>
      <div
        id={searchAssistId}
        className="search-suggest-wrap search-suggest-wrap--split"
        role="listbox"
        aria-label="Gợi ý sản phẩm và danh mục"
      >
        <div className="search-suggest-split__products">
          <ul className="search-suggest-list search-suggest-list--in-split">
            {suggestItems.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="search-suggest-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof onProductClick === "function") onProductClick(row, isMobile);
                  }}
                >
                  <SearchSuggestThumb src={row.image} />
                  <span className="search-suggest-text">
                    <span className="search-suggest-title">
                      {row.shortDescription || row.partName}
                    </span>
                    <span className="search-suggest-meta">
                      {[
                        (Array.isArray(row.cardHighlights) &&
                          row.cardHighlights[0]
                          ? row.cardHighlights[0]
                          : null) ||
                          row.subtitleLine1 ||
                          (row.partNumber ? `Mã ${row.partNumber}` : ""),
                        row.priceText || "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {/* Category suggestions (rendered when present) */}
        {categorySuggestions && categorySuggestions.length > 0 && (
          <div
            className="search-suggest-split__categories"
            role="list"
            aria-label="Danh mục gợi ý"
          >
            <div className="search-suggest-split__sub">DANH MỤC LIÊN QUAN</div>
            <ul className="search-suggest-cat-list">
              {categorySuggestions.length === 0 ? (
                <li className="search-suggest-category-empty">
                  Không tìm thấy nhóm danh mục phù hợp.
                </li>
              ) : (
                categorySuggestions.map((item) => (
                  <li key={item.canonical_slug}>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof onCategoryClick === "function") onCategoryClick(item);
                      }}
                      className="search-suggest-cat-pill"
                    >
                      <span>{item.canonical_name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

