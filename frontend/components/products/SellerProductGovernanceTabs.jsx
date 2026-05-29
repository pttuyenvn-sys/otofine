"use client";

import { LIFECYCLE_TABS } from "@/lib/seller/sellerProductGovernance";

export default function SellerProductGovernanceTabs({
  value = "all",
  onChange,
  stats = {},
  tabs = LIFECYCLE_TABS,
}) {
  return (
    <div className="seller-gov-tabs">
      {tabs.map((tab) => {
        const active = tab.key === value;
        const count = stats[tab.key === "all" ? "all" : tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            className={`seller-gov-tab${active ? " is-active" : ""}`}
            onClick={() => onChange && onChange(tab.key)}
          >
            <span>{tab.label}</span>
            {typeof count === "number" ? (
              <span className="seller-gov-tab-count">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
