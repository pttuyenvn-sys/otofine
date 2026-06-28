/**
 * ARCH-07.2 — H1 composition for shop SEO pages.
 */

import { SHOP_NAMESPACE } from "./namespace.js";

export function buildShopSeoH1(entity) {
  if (!entity) return "";

  switch (entity.namespace) {
    case SHOP_NAMESPACE.SHOP_HOME:
      return "";
    case SHOP_NAMESPACE.SHOP_COLLECTION: {
      const count = entity.productCount ?? entity.filters?.productCount;
      if (count != null && Number(count) >= 0) {
        return `Tất cả sản phẩm phụ tùng ô tô (${Number(count).toLocaleString("vi-VN")})`;
      }
      return "Tất cả sản phẩm phụ tùng ô tô";
    }
    case SHOP_NAMESPACE.SHOP_CATEGORY:
    case SHOP_NAMESPACE.SHOP_CATEGORY_BRAND:
    case SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE:
    case SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE_YEAR:
    case SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE:
      return withCount(buildCategoryH1(entity.filters || {}), entity.productCount);
    case SHOP_NAMESPACE.SHOP_VEHICLE:
    case SHOP_NAMESPACE.SHOP_VEHICLE_YEAR:
    case SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE:
      return withCount(buildVehicleH1(entity.filters || {}), entity.productCount);
    default:
      return "";
  }
}

export function buildCategoryH1(filters) {
  const categoryName = String(filters.categoryName || "Phụ tùng").trim();
  const hasRefinement = Boolean(filters.brand || filters.model || filters.year);
  const root = hasRefinement ? stripOtO(categoryName) : ensureOtO(categoryName);
  const parts = [root];

  if (filters.brand) parts.push(String(filters.brand).trim());
  if (filters.model) parts.push(String(filters.model).trim());
  if (filters.year) parts.push(String(filters.year).trim());

  return parts.filter(Boolean).join(" ");
}

export function buildVehicleH1(filters) {
  const parts = ["Phụ tùng"];
  if (filters.brand) parts.push(String(filters.brand).trim());
  if (filters.model) parts.push(String(filters.model).trim());
  if (filters.year) parts.push(String(filters.year).trim());
  return parts.join(" ");
}

function stripOtO(name) {
  return String(name || "")
    .replace(/\s+ô\s+tô\s*$/i, "")
    .replace(/\s+oto\s*$/i, "")
    .trim();
}

function ensureOtO(name) {
  const root = stripOtO(name);
  if (!root) return "Phụ tùng ô tô";
  return `${root} ô tô`;
}

function withCount(label, count) {
  const text = String(label || "").trim();
  if (!text) return text;
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) return text;
  return `${text} (${n.toLocaleString("vi-VN")})`;
}
