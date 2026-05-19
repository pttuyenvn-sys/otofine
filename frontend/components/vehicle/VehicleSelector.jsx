"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useVehicleSelector } from "@/hooks/useVehicleSelector";
import {
  pickBrandLabel,
  pickModelLabel,
  pickYearLabel,
} from "@/lib/vehicle/vehicleFilterApi";
import "./VehicleSelector.css";

function SearchableVehicleField({
  id,
  label,
  required,
  value,
  disabled,
  loading,
  emptyHint,
  options,
  getLabel,
  onSelect,
  invalid,
}) {
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const rootRef = useRef(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = options
      .map((item, index) => ({
        key: `${getLabel(item)}-${index}`,
        label: getLabel(item),
        item,
      }))
      .filter((row) => row.label);
    if (!q) return rows;
    return rows.filter((row) => row.label.toLowerCase().includes(q));
  }, [options, query, getLabel]);

  const showList = open && !disabled;

  return (
    <div className="vehicle-selector-field" ref={rootRef}>
      <label htmlFor={id}>
        {label}
        {required ? <span className="req"> *</span> : null}
      </label>
      <input
        id={id}
        type="text"
        className={`vehicle-selector-input${invalid ? " vehicle-selector-input--invalid" : ""}`}
        value={query}
        disabled={disabled}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        placeholder={disabled ? "Chọn trường trước" : "Gõ để tìm…"}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {showList ? (
        <ul id={listId} className="vehicle-selector-list" role="listbox">
          {loading ? (
            <li className="vehicle-selector-status">
              <span className="vehicle-selector-loading" role="status">
                <span className="vehicle-selector-spinner" aria-hidden />
                Đang tải…
              </span>
            </li>
          ) : null}
          {!loading && !filtered.length ? (
            <li className="vehicle-selector-status">{emptyHint}</li>
          ) : null}
          {!loading
            ? filtered.map((row) => (
                <li key={row.key} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === row.label}
                    className={[
                      "vehicle-selector-option",
                      value === row.label ? "vehicle-selector-option--selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(row.label);
                      setQuery(row.label);
                      setOpen(false);
                    }}
                  >
                    {row.label}
                  </button>
                </li>
              ))
            : null}
        </ul>
      ) : null}
      {loading && !showList ? (
        <p className="vehicle-selector-status">
          <span className="vehicle-selector-loading" role="status">
            <span className="vehicle-selector-spinner" aria-hidden />
            Đang tải…
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Searchable brand → model → year — same /filter/* APIs + fetchJsonCached TTLs as Home.
 * Labels map 1:1 into RFQ vehicle_json; rfqFingerprint normalizes for dedupe;
 * shop dispatch matching should keep using these canonical /filter/* names.
 */
export default function VehicleSelector({
  value,
  onChange,
  required = false,
  showErrors = false,
  className = "",
}) {
  const baseId = useId();
  const selector = useVehicleSelector({ value, onChange, enabled: true });

  const brandMissing = required && showErrors && !selector.brand.trim();
  const modelMissing = required && showErrors && !selector.model.trim();
  const yearMissing = required && showErrors && !selector.year.trim();

  return (
    <fieldset
      className={`vehicle-selector vehicle-selector--row ${className}`.trim()}
      aria-label="Thông tin xe"
    >
      <SearchableVehicleField
        id={`${baseId}-brand`}
        label="Hãng xe"
        required={required}
        value={selector.brand}
        disabled={false}
        loading={selector.brandsLoading}
        emptyHint="Chưa có dữ liệu hãng xe."
        options={selector.brands}
        getLabel={pickBrandLabel}
        invalid={brandMissing}
        onSelect={selector.setBrand}
      />
      <SearchableVehicleField
        id={`${baseId}-model`}
        label="Dòng xe"
        required={required}
        value={selector.model}
        disabled={!selector.brand.trim()}
        loading={selector.modelsLoading}
        emptyHint={
          selector.brand.trim()
            ? "Không có dòng xe cho hãng này."
            : "Chọn hãng trước."
        }
        options={selector.models}
        getLabel={pickModelLabel}
        invalid={modelMissing}
        onSelect={selector.setModel}
      />
      <div className="vehicle-selector__year">
        <SearchableVehicleField
          id={`${baseId}-year`}
          label="Năm sản xuất"
          required={required}
          value={selector.year}
          disabled={!selector.brand.trim() || !selector.model.trim()}
          loading={selector.yearsLoading}
          emptyHint={
            selector.brand.trim() && selector.model.trim()
              ? "Không có năm cho dòng này."
              : "Chọn hãng và dòng trước."
          }
          options={selector.years}
          getLabel={pickYearLabel}
          invalid={yearMissing}
          onSelect={selector.setYear}
        />
      </div>
    </fieldset>
  );
}