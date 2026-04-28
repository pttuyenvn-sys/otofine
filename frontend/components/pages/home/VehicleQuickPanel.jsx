"use client";

import React from "react";

const HOT_COUNT = 8;

/**
 * Flow chọn nhanh 3 bước — hãng → dòng → năm.
 * Data: brands / draftModels / draftYears giống thứ tự API (top theo total).
 */
export default function VehicleQuickPanel({
  quickStep,
  quickDraft,
  onPickBrand,
  onPickModel,
  onPickYear,
  onClearYear,
  onBreadcrumbToStep,
  brands,
  draftModels,
  draftYears,
  modelsLoading,
  yearsLoading,
  onAdvanced,
  onApply,
  onReset,
}) {
  const brandLabel = (quickDraft.brand || "").trim();
  const modelLabel = (quickDraft.model || "").trim();
  const yearLabel = quickDraft.year != null ? String(quickDraft.year).trim() : "";

  return (
    <div className="vehicle-quick-root">
      {/* Chỉ nút Chọn nâng cao — tiêu đề đã có ở car-header / mobile-head */}
      <div className="vehicle-quick-advanced-row">
        <button
          type="button"
          className="vehicle-quick-advanced-btn"
          onClick={(e) => {
            e.stopPropagation();
            onAdvanced();
          }}
        >
          Chọn nâng cao
        </button>
      </div>

      {(quickStep >= 2 || brandLabel) && (
        <div className="vehicle-breadcrumb-chips" aria-live="polite">
          {brandLabel ? (
            <button
              type="button"
              className={`vehicle-chip vehicle-chip--crumb ${quickStep === 1 ? "vehicle-chip--crumb-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onBreadcrumbToStep(1);
              }}
            >
              {brandLabel}
            </button>
          ) : null}
          {modelLabel ? (
            <button
              type="button"
              className={`vehicle-chip vehicle-chip--crumb ${quickStep === 2 ? "vehicle-chip--crumb-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onBreadcrumbToStep(2);
              }}
            >
              {modelLabel}
            </button>
          ) : null}
          {yearLabel ? (
            <button
              type="button"
              className={`vehicle-chip vehicle-chip--crumb vehicle-chip--crumb-year ${quickStep === 3 ? "vehicle-chip--crumb-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onClearYear();
              }}
            >
              {yearLabel}
            </button>
          ) : null}
        </div>
      )}

      <div className="vehicle-quick-body">
        {quickStep === 1 && (
          <VehiclePickList
            ariaLabel="Danh sách hãng xe"
            variant="brand"
            loading={false}
            emptyHint="Chưa có dữ liệu hãng xe."
            items={brands.map((item, index) => ({
              key: item.hang_xe,
              label: item.hang_xe,
              hot: index < HOT_COUNT,
              selected: brandLabel === item.hang_xe,
              onSelect: () => onPickBrand(item.hang_xe),
            }))}
          />
        )}

        {quickStep === 2 && (
          <VehiclePickList
            ariaLabel="Danh sách dòng xe"
            variant="model"
            loading={modelsLoading}
            emptyHint={brandLabel ? "Không có dòng xe cho hãng này." : "Chọn hãng trước."}
            items={draftModels.map((item, index) => ({
              key: item.ten_xe,
              label: item.ten_xe,
              hot: index < HOT_COUNT,
              selected: modelLabel === item.ten_xe,
              onSelect: () => onPickModel(item.ten_xe),
            }))}
          />
        )}

        {quickStep === 3 &&
          (yearLabel ? (
            <p className="vehicle-quick-done">
              Đã chọn đủ hãng, dòng và năm. Bấm <strong>Chọn</strong> để lọc sản phẩm hoặc đổi năm ở trên.
            </p>
          ) : (
            <VehiclePickList
              ariaLabel="Danh sách năm sản xuất"
              variant="year"
              loading={yearsLoading}
              emptyHint={
                brandLabel && modelLabel
                  ? "Không có năm cho dòng này."
                  : "Chọn hãng và dòng trước."
              }
              items={draftYears.map((year, idx) => ({
                key: String(year),
                label: String(year),
                hot: idx < HOT_COUNT,
                selected: yearLabel === String(year),
                onSelect: () => onPickYear(String(year)),
              }))}
            />
          ))}
      </div>

      <div className="vehicle-quick-actions choose-wrap">
        <button
          type="button"
          className="search-btn"
          onClick={(e) => {
            e.stopPropagation();
            onApply();
          }}
        >
          Chọn
        </button>
        <button
          type="button"
          className="clear-filter-btn"
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
        >
          ↺ Reset
        </button>
      </div>
    </div>
  );
}

function VehiclePickList({ ariaLabel, loading, emptyHint, items, variant = "brand" }) {
  if (loading) {
    return (
      <div className="vehicle-quick-loading" role="status">
        <span className="vehicle-quick-spinner" aria-hidden />
        Đang tải…
      </div>
    );
  }

  if (!items.length) {
    return <p className="vehicle-quick-empty">{emptyHint}</p>;
  }

  const listClass =
    variant === "year"
      ? "vehicle-pick-chips vehicle-pick-chips--year"
      : "vehicle-pick-chips";

  return (
    <div className={listClass} role="list" aria-label={ariaLabel}>
      {items.map((it) => {
        const chipClass = [
          "vehicle-chip",
          "vehicle-chip--pick",
          variant === "brand" && "vehicle-chip--brand",
          variant === "model" && "vehicle-chip--model",
          variant === "year" && "vehicle-chip--year",
          it.hot && "vehicle-chip--hot",
          it.selected && "vehicle-chip--selected",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={it.key}
            type="button"
            role="listitem"
            className={chipClass}
            aria-pressed={it.selected ? "true" : "false"}
            onClick={(e) => {
              e.stopPropagation();
              it.onSelect();
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
