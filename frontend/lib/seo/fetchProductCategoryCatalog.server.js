import { cache } from "react";

import { API_BASE } from "@/lib/config";

async function fetchJson(path) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Product category catalog rows with resilient fallbacks.
 * Primary: /product-categories (full canonical_slug rows).
 * Fallback: /product-categories/canonical (subset, still has canonical_slug).
 */
export const fetchProductCategoryRows = cache(
  async function fetchProductCategoryRows() {
    let categories = await fetchJson("/product-categories");
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      categories = await fetchJson("/product-categories/canonical");
    }
    return Array.isArray(categories) ? categories : [];
  },
);
