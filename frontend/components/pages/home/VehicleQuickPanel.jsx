"use client";

import React from "react";
import {
  pickBrandLabel,
  pickModelLabel,
  pickYearLabel,
} from "@/lib/vehicle/vehicleFilterApi";
import { useVehicleQuickPanel } from "@/components/pages/home/hooks/useVehicleQuickPanel";

const HOT_COUNT = 8;

/**
 * Vehicle quick-select panel — state lives in useVehicleQuickPanel.
 * Home passes brand/model/year as listing source of truth.
 */
export default function VehicleQuickPanel(props) {
  const panel = useVehicleQuickPanel(props);

  const {
    quickStep,
    quickDraft,
    draftModels,
    draftYears,
    draftModelsLoading,
    draftYearsLoading,
    brands,
    onPickBrand,
    onPickModel,
    onPickYear,
    onBreadcrumbToStep,
    onReset,
  } = panel;

  const brandLabel = (quickDraft.brand || "").trim();
  const modelLabel = (quickDraft.model || "").trim();
  const yearLabel = quickDraft.year != null ? String(quickDraft.year).trim() : "";
  const renderStep = modelLabel ? 3 : brandLabel ? 2 : 1;

  return (
    <div className="vehicle-quick-root">
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
              }}
            >
              {yearLabel}
            </button>
          ) : null}
          {brandLabel ? (
            <button
              type="button"
              className="vehicle-chip vehicle-chip--crumb"
              aria-label="Xóa chọn xe"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
            >
              X
            </button>
          ) : null}
        </div>
      )}

      <div className="vehicle-quick-body">
        {renderStep === 1 && (
          <VehiclePickList
            ariaLabel="Danh sách hãng xe"
            variant="brand"
            loading={false}
            emptyHint="Chưa có dữ liệu hãng xe."
            items={brands
              .map((item, index) => {
                const label = pickBrandLabel(item);
                return {
                  key: `brand-${label || index}-${index}`,
                  label,
                  hot: index < HOT_COUNT,
                  selected: brandLabel === label,
                  onSelect: () => onPickBrand(label),
                };
              })
              .filter((item) => item.label)}
          />
        )}

        {renderStep === 2 && (
          <VehiclePickList
            ariaLabel="Danh sách dòng xe"
            variant="model"
            loading={draftModelsLoading}
            emptyHint={brandLabel ? "Không có dòng xe cho hãng này." : "Chọn hãng trước."}
            items={draftModels
              .map((item, index) => {
                const label = pickModelLabel(item);
                return {
                  key: `model-${label || index}-${index}`,
                  label,
                  hot: index < HOT_COUNT,
                  selected: modelLabel === label,
                  onSelect: () => onPickModel(label),
                };
              })
              .filter((item) => item.label)}
          />
        )}

        {renderStep === 3 && (
          <VehiclePickList
            ariaLabel="Danh sách năm sản xuất"
            variant="year"
            loading={draftYearsLoading}
            emptyHint={
              brandLabel && modelLabel
                ? "Không có năm cho dòng này."
                : "Chọn hãng và dòng trước."
            }
            items={draftYears
              .map((year, idx) => {
                const label = pickYearLabel(year);
                return {
                  key: `year-${label || idx}-${idx}`,
                  label,
                  hot: idx < HOT_COUNT,
                  selected: yearLabel === label,
                  onSelect: () => onPickYear(label),
                };
              })
              .filter((item) => item.label)}
          />
        )}
      </div>

      <div className="vehicle-quick-actions choose-wrap">
        <button
          type="button"
          className="clear-filter-btn"
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
        >
          Xóa
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
      {items.map((it, index) => {
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
            key={it.key || `${variant}-${it.label}-${index}`}
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
