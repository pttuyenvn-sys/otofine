"use client";

import { useVehicleSelector } from "@/hooks/useVehicleSelector";
import {
  pickBrandLabel,
  pickModelLabel,
  pickYearLabel,
} from "@/lib/vehicle/vehicleFilterApi";

function CompactSelect({
  id,
  label,
  value,
  disabled,
  loading,
  options,
  getLabel,
  onSelect,
  placeholder,
}) {
  return (
    <label className="rfq-inbox-filter-field">
      <span className="rfq-inbox-filter-field__label">{label}</span>
      <select
        id={id}
        className="rfq-inbox-filter-select"
        value={value || ""}
        disabled={disabled || loading}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((item, i) => {
          const lab = getLabel(item);
          if (!lab) return null;
          return (
            <option key={`${lab}-${i}`} value={lab}>
              {lab}
            </option>
          );
        })}
      </select>
    </label>
  );
}

/**
 * Compact vehicle + category filters for shop inbox (reuses /filter/* via useVehicleSelector).
 */
export default function ShopInboxVehicleFilters({
  brand,
  model,
  year,
  categoryKey,
  onChange,
}) {
  const value = { brand: brand || "", model: model || "", year: year || "" };
  const selector = useVehicleSelector({
    value,
    onChange: (v) =>
      onChange({
        brand: v.brand,
        model: v.model,
        year: v.year,
        categoryKey,
      }),
  });

  return (
    <div className="rfq-inbox-vehicle-filters">
      <p className="rfq-inbox-vehicle-filters__label muted">Lọc theo xe &amp; danh mục</p>
      <div className="rfq-inbox-vehicle-filters__grid">
        <CompactSelect
          id="inbox-filter-brand"
          label="Hãng"
          value={selector.brand}
          loading={selector.brandsLoading}
          options={selector.brands}
          getLabel={pickBrandLabel}
          placeholder="Tất cả hãng"
          onSelect={selector.setBrand}
        />
        <CompactSelect
          id="inbox-filter-model"
          label="Dòng"
          value={selector.model}
          disabled={!selector.brand}
          loading={selector.modelsLoading}
          options={selector.models}
          getLabel={pickModelLabel}
          placeholder="Tất cả dòng"
          onSelect={selector.setModel}
        />
        <CompactSelect
          id="inbox-filter-year"
          label="Năm"
          value={selector.year}
          disabled={!selector.brand || !selector.model}
          loading={selector.yearsLoading}
          options={selector.years}
          getLabel={pickYearLabel}
          placeholder="Tất cả năm"
          onSelect={selector.setYear}
        />
        <label className="rfq-inbox-filter-field">
          <span className="rfq-inbox-filter-field__label">Danh mục (key)</span>
          <input
            type="text"
            className="rfq-inbox-filter-input"
            value={categoryKey || ""}
            placeholder="VD: phanh, loc-dau"
            onChange={(e) =>
              onChange({
                brand: selector.brand,
                model: selector.model,
                year: selector.year,
                categoryKey: e.target.value,
              })
            }
          />
        </label>
      </div>
      {(brand || model || year || categoryKey) && (
        <button
          type="button"
          className="rfq-btn rfq-btn--ghost rfq-btn--sm"
          onClick={() =>
            onChange({ brand: "", model: "", year: "", categoryKey: "" })
          }
        >
          Xóa bộ lọc xe
        </button>
      )}
    </div>
  );
}
