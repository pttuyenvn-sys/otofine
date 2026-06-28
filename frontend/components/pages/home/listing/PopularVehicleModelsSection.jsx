"use client";

import React, { useState } from "react";

const MODELS_INITIAL = 10;

export default function PopularVehicleModelsSection({
  seoDisplayModels = [],
  applyVehicleQuickFilter,
  variant = "desktop",
  className = "",
}) {
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const visibleModels = modelsExpanded
    ? seoDisplayModels
    : seoDisplayModels.slice(0, MODELS_INITIAL);
  const hasMoreModels = seoDisplayModels.length > MODELS_INITIAL;

  if (!seoDisplayModels.length) return null;

  const rootClass = [
    "left-section",
    "left-section--models",
    "of-rail-links",
    variant === "mobile" && "of-rail-links--mobile",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handleSelect = (brand, model) => {
    applyVehicleQuickFilter?.(brand, model);
  };

  return (
    <div
      className={rootClass}
      aria-label="Mua phụ tùng theo hãng &amp; dòng xe"
    >
      {variant === "mobile" ? (
        <hr className="of-rail-links__divider" aria-hidden />
      ) : null}
      <h4 className="of-rail-card__h">Dòng xe phổ biến</h4>
      {variant === "mobile" ? (
        <ul className="of-rail-links__list">
          {visibleModels.map((row) => (
            <li key={`${row.brand}-${row.model}`}>
              <button
                type="button"
                className="of-rail-link of-rail-link--muted of-rail-link--block"
                onClick={() => handleSelect(row.brand, row.model)}
              >
                {row.brand} {row.model}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="of-rail-links__p">
          {visibleModels.map((row, i) => (
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
                onClick={() => handleSelect(row.brand, row.model)}
              >
                {row.brand} {row.model}
              </button>
            </React.Fragment>
          ))}
        </p>
      )}
      {hasMoreModels && !modelsExpanded ? (
        <button
          type="button"
          className="of-rail-more"
          onClick={() => setModelsExpanded(true)}
        >
          Xem thêm →
        </button>
      ) : null}
    </div>
  );
}
