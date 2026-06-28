import React from "react";
import PopularCategoriesSection from "@/components/pages/home/listing/PopularCategoriesSection";
import PopularVehicleModelsSection from "@/components/pages/home/listing/PopularVehicleModelsSection";
import VehicleQuickPanel from "@/components/pages/home/VehicleQuickPanel";

export default function MobileDrawers(props) {
  const {
    mobileFilter,
    mobileMenu,
    mobileQuote,
    closeMobileVehiclePanel,
    closeMobileCategoryPanel,
    vehicleQuickPanelProps,
    seoDisplayModels = [],
    applyVehicleQuickFilterMobile,
    popularCategories = [],
    selectedCategory,
    onPopularCategoryClickMobile,
    setMobileQuote,
  } = props;

  return (
    <>
      {mobileFilter && (
        <div className="mobile-drawer" onClick={closeMobileVehiclePanel}>
          <div className="mobile-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-head">
              <span className="mobile-head-title">Chọn xe</span>
              <button
                type="button"
                className="mobile-head-close"
                onClick={closeMobileVehiclePanel}
                aria-label="Đóng"
              >
                Xem
              </button>
            </div>
            <div className="mobile-filter-body mobile-filter-body--vehicle">
              <VehicleQuickPanel {...vehicleQuickPanelProps} />
              <PopularVehicleModelsSection
                variant="mobile"
                seoDisplayModels={seoDisplayModels}
                applyVehicleQuickFilter={applyVehicleQuickFilterMobile}
              />
            </div>
          </div>
        </div>
      )}

      {mobileMenu && (
        <div className="mobile-drawer" onClick={closeMobileCategoryPanel}>
          <div className="mobile-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-head">
              <span className="mobile-head-title">Danh mục</span>
              <button
                type="button"
                className="mobile-head-close"
                onClick={closeMobileCategoryPanel}
                aria-label="Đóng"
              >
                Xem
              </button>
            </div>
            <div className="mobile-filter-body mobile-filter-body--vehicle">
              <PopularCategoriesSection
                variant="mobile"
                categories={popularCategories}
                selectedCategory={selectedCategory}
                onCategoryClick={onPopularCategoryClickMobile}
              />
            </div>
          </div>
        </div>
      )}

      {mobileQuote && (
        <div className="mobile-drawer" onClick={() => setMobileQuote(false)}>
          <div className="mobile-panel mobile-panel--quote" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-head mobile-head--quote">
              <span className="mobile-head-title">Yêu cầu báo giá phụ tùng</span>
              <button
                type="button"
                className="mobile-head-close"
                onClick={() => setMobileQuote(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="mobile-quote-body">
              <p className="mobile-quote-subtitle">Nhiều shop sẽ nhận yêu cầu và báo giá nhanh.</p>
              <div className="mobile-quote-form">
                <label className="mobile-quote-label">Tên phụ tùng</label>
                <input
                  type="text"
                  className="mobile-quote-input"
                  placeholder="VD: Má phanh Camry 2020"
                />
                <label className="mobile-quote-label">Số khung / VIN (nếu có)</label>
                <input
                  type="text"
                  className="mobile-quote-input"
                  placeholder="VD: JTDBR9HX..."
                />
                <button type="button" className="mobile-quote-upload">
                  📷 Đính kèm ảnh phụ tùng / đăng kiểm
                </button>
                <button type="button" className="mobile-quote-submit">
                  Gửi yêu cầu báo giá
                </button>
              </div>
              <ul className="mobile-quote-trust">
                <li>✓ Nhiều shop nhận yêu cầu</li>
                <li>✓ Báo giá nhanh trong ngày</li>
                <li>✓ Hỗ trợ tìm đúng phụ tùng</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
