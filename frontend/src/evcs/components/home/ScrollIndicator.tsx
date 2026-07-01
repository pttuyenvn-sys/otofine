"use client";

import { SCROLL_INDICATOR } from "@evcs/constants/homeContent";

export function ScrollIndicator() {
  const handleClick = () => {
    const target = document.getElementById(SCROLL_INDICATOR.targetId);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <button
      type="button"
      className="evcs-scroll-indicator"
      onClick={handleClick}
      aria-label={SCROLL_INDICATOR.label}
    >
      <span className="evcs-scroll-indicator__chevron" aria-hidden />
    </button>
  );
}
