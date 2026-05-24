"use client";

import { useEffect, useState } from "react";

/**
 * Mirror of the seller-side `useDebouncedValue` used in
 * `components/pages/ShopSettings.jsx`. Pulled into a shared module
 * so the shopsite filter row doesn't have to depend on the seller
 * panel just to debounce.
 */
export function useDebouncedValue(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
