/**
 * SEARCH-GROUPED-VEHICLE-POPUP-01 — preview product ordering for search popup.
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

/**
 * @param {object[]} products
 */
export function sortSuggestPreviewProducts(products) {
  const list = Array.isArray(products) ? [...products] : [];

  return list.sort((a, b) => {
    const score = (row) => {
      let points = 0;
      if (hasProductImage(row)) points += 1000;
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

export { foldVi };
