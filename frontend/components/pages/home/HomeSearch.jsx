"use client";

import { startTransition, useCallback, useEffect, useRef } from "react";
import { SearchSuggestThumb } from "@/components/pages/home/HomeImages";
import { buildProductImageAlt } from "@/lib/seo/buildProductImageAlt";
import { toThumb100 } from "@/lib/imageVariants";
import { dismissMobileSearchKeyboard } from "@/lib/search/dismissMobileSearchKeyboard";
import SearchQueryHighlight from "@/components/search/SearchQueryHighlight";

/**
 * HomeSearch — search input + grouped vehicle popup (single suggest response).
 */
export default function HomeSearch({
  isMobile,
  pageTitle,
  searchInputValue,
  suggestPanelOpen,
  searchSuggestResponse = { groups: [], viewAll: { label: "", url: "/" }, categories: [] },
  suggestLoading = false,
  filteredCategories,
  popularQuickKeywords,
  recentSearches,
  leftPopularOpen,
  leftRecentOpen,
  SEARCH_POPULAR_ANCHORS,
  searchPanelRef,
  inputRef,
  textMeasureRef,
  categoryItemRefs,
  setSuggestPanelOpen,
  setSearchInputValue,
  setMobileMenu,
  setMobileFilter,
  setLeftPopularOpen,
  setLeftRecentOpen,
  submitCommittedSearch,
  clearSearchCommitted,
  handleQuickProductClick,
  handleSuggestGroupClick,
  vehicleSuggestContext = {},
  navigateToState,
  setKeyword,
  setPage,
  clearRecentSearches,
}) {
  const dropdownRef = useRef(null);
  const bodyScrollYRef = useRef(0);

  const searchAssistId = `otofine-search-suggest${isMobile ? "-m" : ""}`;
  const hasSearchKeyword = searchInputValue.trim().length > 0;

  const previewGroups = Array.isArray(searchSuggestResponse?.groups)
    ? searchSuggestResponse.groups
    : [];
  const categorySuggestions = searchSuggestResponse?.categories || [];

  const previewProductCount = previewGroups.reduce(
    (sum, group) => sum + (group?.products?.length || 0),
    0,
  );

  const showPreviewGroups = previewGroups.length > 0;
  const showProductEmpty =
    hasSearchKeyword &&
    !suggestLoading &&
    categorySuggestions.length > 0 &&
    previewProductCount === 0 &&
    previewGroups.length > 0;
  const showNoCategories =
    hasSearchKeyword && !suggestLoading && categorySuggestions.length === 0;

  const hasQuickSuggest =
    suggestPanelOpen &&
    hasSearchKeyword &&
    (showPreviewGroups || showProductEmpty || showNoCategories);

  const showDropdown = suggestPanelOpen && hasSearchKeyword;
  const mobileOverlayActive = isMobile && suggestPanelOpen;

  const dismissKeyboardIfMobile = useCallback(() => {
    if (isMobile) dismissMobileSearchKeyboard(inputRef);
  }, [isMobile, inputRef]);

  useEffect(() => {
    if (!mobileOverlayActive || typeof document === "undefined") return undefined;

    bodyScrollYRef.current = window.scrollY;
    document.body.classList.add("of-mobile-search-overlay-active");
    document.body.style.top = `-${bodyScrollYRef.current}px`;

    return () => {
      document.body.classList.remove("of-mobile-search-overlay-active");
      document.body.style.top = "";
      window.scrollTo(0, bodyScrollYRef.current);
    };
  }, [mobileOverlayActive]);

  useEffect(() => {
    if (!isMobile || !showDropdown) return undefined;

    const dismissOnInteraction = () => {
      dismissMobileSearchKeyboard(inputRef);
    };

    const roots = [];
    const panel = searchPanelRef?.current;
    if (!panel) return undefined;

    const attachScroll = (el) => {
      if (!el) return;
      el.addEventListener("scroll", dismissOnInteraction, { passive: true });
      roots.push({ el, type: "scroll" });
    };

    attachScroll(dropdownRef.current);
    panel
      .querySelectorAll(
        ".home-search-dropdown, .search-suggest-panel, .search-suggest-group, .search-suggest-group__products",
      )
      .forEach((el) => attachScroll(el));

    const resultsRoot =
      dropdownRef.current || panel.querySelector(".home-search-dropdown");
    if (resultsRoot) {
      resultsRoot.addEventListener("touchmove", dismissOnInteraction, {
        passive: true,
      });
      roots.push({ el: resultsRoot, type: "touchmove" });
    }

    return () => {
      roots.forEach(({ el, type }) => el.removeEventListener(type, dismissOnInteraction));
    };
  }, [isMobile, showDropdown, inputRef, searchPanelRef, previewProductCount]);

  const handleGroupPick = useCallback(
    (group) => {
      dismissKeyboardIfMobile();
      if (typeof handleSuggestGroupClick === "function") {
        handleSuggestGroupClick(group);
        return;
      }
      startTransition(() => {
        navigateToState({ category: group?.canonical_name || "" });
        setKeyword("");
        setPage(1);
      });
    },
    [
      dismissKeyboardIfMobile,
      handleSuggestGroupClick,
      navigateToState,
      setKeyword,
      setPage,
    ],
  );

  const handleProductPick = useCallback(
    (row) => {
      dismissKeyboardIfMobile();
      handleQuickProductClick(row, isMobile);
    },
    [dismissKeyboardIfMobile, handleQuickProductClick, isMobile],
  );

  const handleSubmitSearch = useCallback(() => {
    dismissKeyboardIfMobile();
    submitCommittedSearch();
    if (isMobile) {
      setMobileMenu(false);
      setMobileFilter(false);
    }
  }, [
    dismissKeyboardIfMobile,
    submitCommittedSearch,
    isMobile,
    setMobileMenu,
    setMobileFilter,
  ]);

  return (
    <div
      ref={searchPanelRef}
      className={
        isMobile
          ? `of-header-search of-header-search--mobile${mobileOverlayActive ? " of-mobile-search-overlay" : ""}`
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
            <p className="of-mobile-search-h1__text">{pageTitle}</p>
          </div>
        )}
      </div>

      <div className="search-panel-wrap">
        {isMobile && <p className="of-side-label">Tìm phụ tùng</p>}
        <div className="search-combo search-sidebar-combo">
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
                aria-controls={suggestPanelOpen && hasQuickSuggest ? searchAssistId : undefined}
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
                    handleSubmitSearch();
                  }
                  if (e.key === "Escape") {
                    dismissKeyboardIfMobile();
                    setSuggestPanelOpen(false);
                  }
                }}
              />

              <span className="measure-text" ref={textMeasureRef}>
                {searchInputValue}
              </span>

              <button
                type="button"
                className="clear-inline"
                onClick={() => {
                  dismissKeyboardIfMobile();
                  clearSearchCommitted();
                }}
                aria-label="Xóa tìm kiếm"
              >
                ✕
              </button>

              <span
                className="category-icon"
                role="button"
                tabIndex={0}
                onClick={handleSubmitSearch}
              >
                🔍
              </span>
            </div>
          </div>

          {showDropdown && (
            <div className="home-search-dropdown" ref={dropdownRef}>
              <div className="search-suggest-panel" id={searchAssistId} role="listbox">
                {showPreviewGroups &&
                  previewGroups.map((group) => {
                    const groupKey = `${group.canonical_slug || group.canonical_name}-${group.model || ""}-${group.brand || ""}`;
                    return (
                      <section
                        key={groupKey}
                        className="search-suggest-group search-suggest-block"
                        aria-label={group.title || group.canonical_name}
                      >
                        <button
                          type="button"
                          className="search-suggest-group__header search-suggest-block__header search-suggest-cat-row"
                          onMouseDown={(e) => {
                            if (isMobile) e.preventDefault();
                          }}
                          onClick={() => handleGroupPick(group)}
                        >
                          <span className="search-suggest-cat-row__label">
                            <SearchQueryHighlight
                              text={group.title || group.canonical_name || ""}
                              query={searchInputValue}
                            />
                          </span>
                          {group.count != null && (
                            <span className="search-suggest-cat-row__count">
                              ({group.count})
                            </span>
                          )}
                        </button>

                        {group.products?.length > 0 ? (
                          <ul className="search-suggest-list search-suggest-list--panel search-suggest-group__products search-suggest-block__products">
                            {group.products.map((row) => (
                              <li key={row.id}>
                                <button
                                  type="button"
                                  className="search-suggest-item"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleProductPick(row);
                                  }}
                                >
                                  <SearchSuggestThumb
                                    src={toThumb100(row.image)}
                                    alt={buildProductImageAlt(row)}
                                  />
                                  <span className="search-suggest-text">
                                    <SearchQueryHighlight
                                      className="search-suggest-title"
                                      text={
                                        row.displayTitle ||
                                        row.productIdentity?.h1 ||
                                        "Sản phẩm"
                                      }
                                      query={searchInputValue}
                                    />
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
                        ) : suggestLoading ? (
                          <ul
                            className="search-suggest-list search-suggest-list--panel search-suggest-group__products search-suggest-block__products search-suggest-group__products--skeleton"
                            aria-hidden="true"
                          >
                            {[0, 1].map((slot) => (
                              <li key={slot}>
                                <div className="search-suggest-skeleton-item">
                                  <span className="search-suggest-skeleton-thumb" />
                                  <span className="search-suggest-skeleton-lines">
                                    <span className="search-suggest-skeleton-line search-suggest-skeleton-line--title" />
                                    <span className="search-suggest-skeleton-line search-suggest-skeleton-line--meta" />
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="search-suggest-empty-msg search-suggest-group__empty search-suggest-block__empty">
                            Không có sản phẩm trong nhóm này.
                          </p>
                        )}
                      </section>
                    );
                  })}

                {showProductEmpty && (
                  <p className="search-suggest-empty-msg">
                    Không tìm thấy sản phẩm phù hợp.
                  </p>
                )}

                {showNoCategories && (
                  <p className="search-suggest-empty-msg">
                    Không tìm thấy nhóm danh mục phù hợp.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
