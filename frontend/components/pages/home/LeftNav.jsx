import React from "react";
import PopularCategoriesBox from "@/components/pages/home/PopularCategoriesBox";

export default function LeftNav({
  carBoxRef,
  open,
  renderVehiclePanelBody,
  goToAdvancedFromQuick,
  quickDraft,
  seoDisplayModels = [],
  applyVehicleQuickFilter,
  popularCategories = [],
  selectedCategory,
  onPopularCategoryClick,
}) {
  return (
    <div className="car-left">
      <div className="car-box" ref={carBoxRef}>
        {/* Thanh chính */}
        <div className="car-header">
          <div className="car-info">
            <span className="car-icon">🚗</span>

            <div className="car-info-text">
              <div className="car-header-top">
                <h4>Chọn xe</h4>

                <button
                  type="button"
                  className="car-advanced-btn"
                  onClick={goToAdvancedFromQuick}
                >
                  Chọn nâng cao
                </button>
              </div>

              <p className="car-header__eyebrow">
                {quickDraft.brand || "HÃNG XE"} /{" "}
                {quickDraft.model || "DÒNG XE"} /{" "}
                {quickDraft.year || "NĂM"}
              </p>
            </div>
          </div>
        </div>
        {/* Nội dung ẩn hiện — Quick / Chọn nâng cao */}
        {open && (
          <div
            className="car-content car-panel-shell"
            role="presentation"
            onClick={(e) => e.stopPropagation()}
          >
            {renderVehiclePanelBody()}
          </div>
        )}
      </div>

      <div
        className="of-rail-card of-rail-links"
        aria-label="Mua phụ tùng theo hãng &amp; dòng xe"
      >
        <h4 className="of-rail-card__h">Dòng xe phổ biến</h4>
        <p className="of-rail-links__p">
          {seoDisplayModels.slice(0, 20).map((row, i) => (
            <React.Fragment key={`${row.brand}-${row.model}`}>
              {i > 0 && (
                <span className="of-rail-sep" aria-hidden>
                  {" "}
                  ·{" "}
                </span>
              )}
              <button
                type="button"
                className="of-rail-link of-rail-link--muted"
                onClick={() =>
                  applyVehicleQuickFilter(row.brand, row.model)
                }
              >
                {row.brand} {row.model}
              </button>
            </React.Fragment>
          ))}
        </p>
      </div>
      <div className="of-rail-cats">
        <PopularCategoriesBox
          categories={popularCategories}
          selectedCategory={selectedCategory}
          onCtaClick={onPopularCategoryClick}
        />
      </div>
    </div>
  );
}

