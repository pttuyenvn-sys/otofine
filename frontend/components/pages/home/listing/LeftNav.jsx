"use client";
import React, { useRef } from "react";
import PopularCategoriesBox from "@/components/pages/home/listing/PopularCategoriesBox";
import PopularVehicleModelsSection from "@/components/pages/home/listing/PopularVehicleModelsSection";
import VehicleQuickPanel from "@/components/pages/home/VehicleQuickPanel";

export default function LeftNav({
  carBoxRef,
  open,
  brand = "",
  model = "",
  year = "",
  vehicleQuickPanelProps,
  seoDisplayModels = [],
  applyVehicleQuickFilter,
  popularCategories = [],
  products = [],
  selectedCategory,
  onPopularCategoryClick,
}) {
  const vehicleAdvancedRef = useRef(null);

  const yearLabel = year != null && year !== "" ? String(year) : "NĂM";

  return (
    <div className="car-left">
      <div className="left-section left-section--vehicle">
        <div className="car-box" ref={carBoxRef}>
          <div className="car-header">
            <div className="car-info">
              <span className="car-icon">🚗</span>

              <div className="car-info-text">
                <div className="car-header-top">
                  <h4>Chọn xe</h4>

                  <button
                    type="button"
                    className="car-advanced-btn"
                    onClick={() => vehicleAdvancedRef.current?.goToAdvanced?.()}
                  >
                    Chọn nâng cao
                  </button>
                </div>

                <p className="car-header__eyebrow">
                  {brand || "HÃNG XE"} / {model || "DÒNG XE"} / {yearLabel}
                </p>
              </div>
            </div>
          </div>
          {open && (
            <div
              className="car-content car-panel-shell"
              role="presentation"
              onClick={(e) => e.stopPropagation()}
            >
              <VehicleQuickPanel
                {...vehicleQuickPanelProps}
                advancedControlRef={vehicleAdvancedRef}
              />
            </div>
          )}
        </div>
      </div>

      <PopularVehicleModelsSection
        seoDisplayModels={seoDisplayModels}
        applyVehicleQuickFilter={applyVehicleQuickFilter}
      />

      <div className="left-section left-section--cats of-rail-cats">
        <PopularCategoriesBox
          categories={popularCategories}
          selectedCategory={selectedCategory}
          onCtaClick={onPopularCategoryClick}
        />
      </div>
    </div>
  );
}
