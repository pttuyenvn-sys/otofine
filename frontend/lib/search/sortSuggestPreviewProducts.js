/**
 * SEARCH-QUERY-SCOPE-AND-PREVIEW-01 — sort category-scoped preview products client-side.
 */

function foldVi(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function hasProductImage(row) {
  return Boolean(String(row?.image || "").trim());
}

function hasOemPartNumber(row) {
  const pn = String(row?.partNumber || row?.productIdentity?.partNumber || "").trim();
  return pn.length >= 4;
}

function isInStock(row) {
  const stock = Number(row?.stock);
  return Number.isFinite(stock) ? stock > 0 : false;
}

function updatedAtMs(row) {
  const raw = row?.updatedAt || row?.updated_at;
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function yearInFitmentRange(year, fitment) {
  const y = Number(year);
  if (!Number.isFinite(y)) return true;
  const from = fitment?.year_from ?? fitment?.yearFrom;
  const to = fitment?.year_to ?? fitment?.yearTo;
  if (from != null && y < Number(from)) return false;
  if (to != null && y > Number(to)) return false;
  return true;
}

/**
 * @param {object} row
 * @param {{ brand?: string, model?: string, year?: string }} scope
 */
export function matchesResolvedVehicleScope(row, scope = {}) {
  const fit = row?.productIdentity?.fitment;
  if (!fit) return false;

  const brand = String(scope.brand || "").trim();
  const model = String(scope.model || "").trim();
  const year = String(scope.year || "").trim();

  if (brand && foldVi(fit.brand) !== foldVi(brand)) return false;
  if (model && foldVi(fit.model) !== foldVi(model)) return false;
  if (year && !yearInFitmentRange(year, fit)) return false;
  return Boolean(brand || model || year);
}

/**
 * @param {object[]} products
 * @param {{ brand?: string, model?: string, year?: string }} scope
 */
export function sortSuggestPreviewProducts(products, scope = {}) {
  const list = Array.isArray(products) ? [...products] : [];

  return list.sort((a, b) => {
    const score = (row) => {
      let points = 0;
      if (hasProductImage(row)) points += 1000;
      if (matchesResolvedVehicleScope(row, scope)) points += 500;
      if (hasOemPartNumber(row)) points += 100;
      if (isInStock(row)) points += 50;
      points += updatedAtMs(row) / 1e12;
      return points;
    };

    const diff = score(b) - score(a);
    if (diff !== 0) return diff;

    return String(a?.displayTitle || a?.partName || "").localeCompare(
      String(b?.displayTitle || b?.partName || ""),
      "vi",
    );
  });
}
