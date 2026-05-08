import { API_BASE } from "@/lib/config";
import { parseLandingSlug } from "./parseLandingSlug";

function appendListingParam(params, key, value) {
  if (value == null) return;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return;
    if (t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return;
    params.set(key, t);
    return;
  }
  params.set(key, String(value));
}

export async function fetchProductList(filters, page = 1) {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, Number(page) || 1)));
  appendListingParam(params, "brand", filters.brand);
  appendListingParam(params, "model", filters.model);
  appendListingParam(params, "year", filters.year);
  appendListingParam(params, "category", filters.category);

  const url = `${API_BASE}/products/list?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) {
    return { page: 1, totalPages: 0, data: [] };
  }
  return res.json();
}

export async function getSeoListingData(slug, page = 1) {
  const parsed = await parseLandingSlug(slug);
  if (parsed.kind === "invalid") {
    return { parsed, list: null };
  }
  const list = await fetchProductList(parsed.filters, page);
  return { parsed, list };
}

/**
 * Dùng cho SEO article / cache: cùng query list với trang loại+xe (Home từ slug).
 * @param {{ selectedCategory: string, filters: { brand?: string, model?: string, year?: string } }} homeState
 */
export async function fetchProductListForHomeSlug(homeState) {
  const f = homeState?.filters || {};
  return fetchProductList(
    {
      brand: f.brand || "",
      model: f.model || "",
      year: f.year || "",
      category: (homeState?.selectedCategory || "").trim(),
    },
    1,
  );
}
