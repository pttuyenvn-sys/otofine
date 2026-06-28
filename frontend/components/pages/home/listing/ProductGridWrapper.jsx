import React, { memo } from "react";
import Link from "next/link";
import { HomeProductCard } from "@/components/pages/home/HomeProductCard";
import ListingHero from "@/components/pages/home/listing/ListingHero";
import FilterBar from "@/components/pages/home/filters/FilterBar";

function ProductGridWrapper({
  keyword,
  listError,
  listBootstrapping,
  products,
  setPage,
  startTransition,
  navigateToState,
  setKeyword,
  setContactPhone,
  pageTitle,
  brand = "",
  sort,
  setSort,
  cityDropdownRef,
  selectedCity,
  setCityDropdownOpen,
  cityDropdownOpen,
  availableLocations,
  onLocationSelect,
}) {
  return (
    <>
      <div className="product-surface">
        <div className="product-surface__intro">
          <div className="product-surface__header">
            <ListingHero pageTitle={pageTitle} brand={brand} />
            {keyword && (
              <div style={{ marginBottom: 8, fontWeight: 600 }}>
                Kết quả tìm kiếm cho: "{keyword}"
              </div>
            )}
          </div>

          <div className="product-surface__controls">
            <FilterBar
              sort={sort}
              setSort={setSort}
              startTransition={startTransition}
              setPage={setPage}
              cityDropdownRef={cityDropdownRef}
              selectedCity={selectedCity}
              setCityDropdownOpen={setCityDropdownOpen}
              cityDropdownOpen={cityDropdownOpen}
              availableLocations={availableLocations}
              onLocationSelect={onLocationSelect}
            />
          </div>
        </div>

        <div className="product-surface__body">

          <div className="center of-product-list">
            {!listError && !listBootstrapping && products.length === 0 ? (
              <div className="of-empty-state" style={{ padding: "24px 16px", textAlign: "center" }}>
                <p style={{ color: "#374151", fontWeight: 600, fontSize: 15, margin: "0 0 8px" }}>
                  Chưa có sản phẩm phù hợp với bộ lọc hiện tại
                </p>
                <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 16px" }}>
                  Thử bỏ bớt bộ lọc hoặc chọn danh mục khác để xem thêm kết quả.
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  {["Má phanh", "Đèn pha", "Lọc gió", "Bơm nước", "Gương chiếu hậu"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className="of-btn of-btn--ghost"
                      style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb", color: "#1f2937", cursor: "pointer" }}
                      onClick={() => {
                        startTransition(() => {
                          navigateToState({ category: cat });
                          setKeyword("");
                          setPage(1);
                        });
                      }}
                    >
                      {cat} ô tô
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {listBootstrapping && products.length === 0 && !listError
              ? Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className="of-product of-product--skeleton"
                  aria-hidden
                />
              ))
              : null}

            {products.map((item, index) => (
              <HomeProductCard
                key={item.id}
                item={item}
                index={index}
                onSelectPhone={setContactPhone}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(ProductGridWrapper);

