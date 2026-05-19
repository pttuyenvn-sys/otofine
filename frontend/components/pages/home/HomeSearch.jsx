"use client";

import { startTransition } from "react";
import { SearchSuggestThumb } from "@/components/pages/home/HomeImages";

/**
 * HomeSearch — search input + dropdown (suggest, category, popular, recent).
 * JSX moved from Home.jsx; all state/logic stays in parent.
 */
export default function HomeSearch({
  isMobile,
  pageTitle,
  searchInputValue,
  suggestPanelOpen,
  suggestItems,
  categorySuggestions,
  filteredCategories,
  popularQuickKeywords,
  recentSearches,
  leftPopularOpen,
  leftRecentOpen,
  SEARCH_POPULAR_ANCHORS,
  // refs
  searchPanelRef,
  inputRef,
  textMeasureRef,
  categoryItemRefs,
  // setters
  setSuggestPanelOpen,
  setSearchInputValue,
  setMobileMenu,
  setMobileFilter,
  setLeftPopularOpen,
  setLeftRecentOpen,
  // callbacks
  submitCommittedSearch,
  clearSearchCommitted,
  handleQuickProductClick,
  navigateToState,
  setKeyword,
  setPage,
  clearRecentSearches,
}) {
  const searchAssistId = `otofine-search-suggest${isMobile ? "-m" : ""}`;
  const hasSearchKeyword = searchInputValue.trim().length > 0;
  const hasQuickSuggest =
    suggestPanelOpen &&
    hasSearchKeyword &&
    Array.isArray(suggestItems) &&
    suggestItems.length > 0;
  const hasCategoryFill =
    suggestPanelOpen && hasSearchKeyword && !hasQuickSuggest;

  const categoryAssistiveId =
    suggestPanelOpen && hasSearchKeyword && !hasQuickSuggest
      ? searchAssistId
      : undefined;

  const displayCategories =
    isMobile && !hasSearchKeyword
      ? filteredCategories.slice(0, 15)
      : filteredCategories;

  const showCategorySuggestions =
    hasSearchKeyword && categorySuggestions.length > 0;

  const showDropdown = suggestPanelOpen && hasSearchKeyword;

  return (
    <div
      ref={searchPanelRef}
      className={
        isMobile
          ? "of-header-search of-header-search--mobile"
          : "of-header-search of-header-search--desktop home-search-container"
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          marginBottom: "4px",
        }}
      >
        {isMobile && (
        <img
          src="/logo.png"
          alt="logo"
          style={{ height: "25px", width: "auto" }}
        />
        )}

        {isMobile && (
          <div className="of-mobile-search-h1">
            <h1 className="of-mobile-search-h1__text">
              {pageTitle}
            </h1>
          </div>
        )}
      </div>

      <div className="search-panel-wrap">
        {isMobile && <p className="of-side-label">Tìm phụ tùng</p>}
        <div className="search-combo search-sidebar-combo">
          {/* ── category-search-wrap ── */}
          <div className="category-search-wrap">
          <div className="search-inline-wrap">
             <input
                ref={inputRef}
                type="text"
                enterKeyHint="search"
                placeholder="Tìm lọc dầu Vios, má phanh Camry, đèn Mazda 3…"
                className="category-search"
                value={searchInputValue}
                autoComplete="off"
                aria-autocomplete="list"
                aria-label="Tìm phụ tùng ô tô"
                aria-expanded={suggestPanelOpen}
                aria-controls={
                  suggestPanelOpen
                    ? hasQuickSuggest || hasCategoryFill
                      ? searchAssistId
                      : undefined
                    : undefined
                }
                onFocus={() => {
                  setSuggestPanelOpen(true);
                }}
                onChange={(e) => {
                  setSearchInputValue(e.target.value);
                  setSuggestPanelOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCommittedSearch();
                    if (isMobile) {
                      setMobileMenu(false);
                      setMobileFilter(false);
                    }
                  }
                  if (e.key === "Escape") setSuggestPanelOpen(false);
                }}
              />

              <span className="measure-text" ref={textMeasureRef}>
                {searchInputValue}
              </span>

              <button
                type="button"
                className="clear-inline"
                onClick={clearSearchCommitted}
                aria-label="Xóa tìm kiếm"
              >
                ✕
              </button>

              <span
                className="category-icon"
                role="button"
                tabIndex={0}
                onClick={() => {
                  submitCommittedSearch();
                  if (isMobile) {
                    setMobileMenu(false);
                    setMobileFilter(false);
                  }
                }}
              >
                🔍
              </span>
            </div>
          </div>

          {/* ── dropdown: category + suggest + quick blocks ── */}
          {showDropdown && (
            <div className="home-search-dropdown">
              {/* ── category-box (FIRST / TOP) ── */}
              <div className="category-box sidebar-category-box of-category-compact">
                {!isMobile && (
                  <h2 className="of-sidebar-cat-heading">Danh mục phụ tùng</h2>
                )}

                <div className="sidebar-category-body">
                  <ul
                    className="category category-scroll"
                    id={categoryAssistiveId}
                    role="listbox"
                    aria-label="Danh mục"
                  >
                    {showCategorySuggestions ? (
                      categorySuggestions.map((item) => (
                        <li
                          key={item.canonical_slug}
                          ref={(el) => {
                            const k = `${isMobile ? "m" : "d"}-${item.canonical_name}`;
                            if (el) categoryItemRefs.current.set(k, el);
                            else categoryItemRefs.current.delete(k);
                          }}
                        >
                          <button
                            onClick={() => {
                              startTransition(() => {
                                navigateToState({ category: item.canonical_name });
                                setKeyword("");
                                setPage(1);
                              });
                            }}
                            className="category-link"
                          >
                            <span className="category-name">{item.canonical_name}</span>
                            {item.total_count && (
                              <span className="category-count">({item.total_count})</span>
                            )}
                          </button>
                        </li>
                      ))
                    ) : (
                      displayCategories.map((item, index) => (
                        <li
                          key={`${item.id || item.canonical_slug || item.category_slug || item.slug || item.canonical_name || "cat"}-${index}`}
                          ref={(el) => {
                            const k = `${isMobile ? "m" : "d"}-${item.canonical_name || item.category_name || item.name}`;
                            if (el) categoryItemRefs.current.set(k, el);
                            else categoryItemRefs.current.delete(k);
                          }}
                        >
                          <button
                            onClick={() => {
                              startTransition(() => {
                                navigateToState({
                                  category: item.canonical_name || item.category_name || item.name,
                                });
                                setKeyword("");
                                setPage(1);
                              });
                            }}
                            className="category-link"
                          >
                            <span className="category-name">{item.canonical_name || item.category_name || item.name}</span>
                            {item.total_count && (
                              <span className="category-count">({item.total_count})</span>
                            )}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              {/* ── product suggestions (SECOND) ── */}
              {hasQuickSuggest && (
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
                              handleQuickProductClick(row, isMobile);
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
                </div>
              )}

              {/* ── popular search ── */}
              <div className="of-left-quick of-left-quick--dropdown">
                {/* <div className="of-side-fold">
                  <button
                    type="button"
                    className="of-side-fold__btn"
                    onClick={() => setLeftPopularOpen((v) => !v)}
                    aria-expanded={leftPopularOpen}
                  >
                    Tìm nhanh phổ biến
                    <span className="of-side-fold__chev" aria-hidden>
                      {leftPopularOpen ? "▾" : "▸"}
                    </span>
                  </button>
                  {leftPopularOpen && (
                    <div className="of-side-fold__panel">
                      <div className="search-chip-row search-chip-row--side">
                        {popularQuickKeywords.map((kw) => (
                          <button
                            key={kw}
                            type="button"
                            className={`search-chip search-chip--quick-popular ${SEARCH_POPULAR_ANCHORS.has(kw) ? "search-chip--quick-anchor" : ""}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              submitCommittedSearch(kw);
                              if (isMobile) setMobileMenu(false);
                              setLeftPopularOpen(false);
                              setLeftRecentOpen(false);
                            }}
                          >
                            {kw}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div> */}

                {/* ── recent search ── */}
                {/* {recentSearches.length > 0 && (
                  <div className="of-side-fold">
                    <button
                      type="button"
                      className="of-side-fold__btn"
                      onClick={() => setLeftRecentOpen((v) => !v)}
                      aria-expanded={leftRecentOpen}
                    >
                      Tìm gần đây
                      <span className="of-side-fold__chev" aria-hidden>
                        {leftRecentOpen ? "▾" : "▸"}
                      </span>
                    </button>
                    {leftRecentOpen && (
                      <div className="of-side-fold__panel">
                        <div className="of-recent-row">
                          <span className="of-recent-hint">Lịch sử</span>
                          <button
                            type="button"
                            className="search-panel-clear-history"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearRecentSearches();
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                        <div className="search-chip-row search-chip-row--side">
                          {recentSearches.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className="search-chip search-chip--quick-recent"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                submitCommittedSearch(t);
                                if (isMobile) setMobileMenu(false);
                                setLeftPopularOpen(false);
                                setLeftRecentOpen(false);
                              }}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )} */}
              </div>
            </div>
          )}
        </div>



      </div>
    </div>
  );
}
