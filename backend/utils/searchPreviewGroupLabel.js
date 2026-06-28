/**
 * SEARCH-GROUPED-VEHICLE-POPUP-01 — group title from category + vehicle.
 */

import { foldVi } from "./suggestPreviewProductSort.js";

function tokenBoundaryMatch(textFold, token) {
  if (!token) return false;
  if (textFold === token) return true;
  if (textFold.startsWith(`${token} `)) return true;
  if (textFold.endsWith(` ${token}`)) return true;
  return textFold.includes(` ${token} `);
}

function categoryNameIncludesVehicleToken(categoryName, brand = "", model = "") {
  const catFold = foldVi(categoryName);
  if (model && tokenBoundaryMatch(catFold, foldVi(model))) return true;
  if (brand && tokenBoundaryMatch(catFold, foldVi(brand))) return true;
  return false;
}

/**
 * @param {string} categoryName
 * @param {{ brand?: string, model?: string, year?: string }} vehicle
 */
export function formatSearchPreviewGroupTitle(categoryName, vehicle = {}) {
  const name = String(categoryName || "").trim();
  const brand = String(vehicle.brand || "").trim();
  const model = String(vehicle.model || "").trim();
  const year = String(vehicle.year || "").trim();
  const parts = [name];

  if (brand && !categoryNameIncludesVehicleToken(name, brand, "")) {
    parts.push(brand);
  }
  if (model && !categoryNameIncludesVehicleToken(name, "", model)) {
    parts.push(model);
  }
  if (year && !name.includes(year)) {
    parts.push(year);
  }

  return parts.filter(Boolean).join(" ");
}
