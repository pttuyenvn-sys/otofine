"use client";

import { useSyncExternalStore } from "react";

/** Tailwind breakpoints for storefront product grids (2 / 3 / 5 cols). */
const QUERIES = [
  { mq: "(min-width: 1024px)", cols: 5 },
  { mq: "(min-width: 640px)", cols: 3 },
];

function getColumnCount() {
  if (typeof window === "undefined") return 2;
  for (const { mq, cols } of QUERIES) {
    if (window.matchMedia(mq).matches) return cols;
  }
  return 2;
}

function subscribeColumns(onStoreChange) {
  if (typeof window === "undefined") return () => {};
  const media = QUERIES.map(({ mq }) => window.matchMedia(mq));
  const handler = () => onStoreChange();
  for (const m of media) m.addEventListener("change", handler);
  return () => {
    for (const m of media) m.removeEventListener("change", handler);
  };
}

export function useListingGridColumns() {
  return useSyncExternalStore(subscribeColumns, getColumnCount, () => 2);
}
