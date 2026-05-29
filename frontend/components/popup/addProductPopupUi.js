/** UI-only helpers for AddProductPopup (no business logic). */

export function getCarChipLabel(row, models = []) {
  if (!row?.carModelId) return "";
  const model = models.find((m) => String(m.id) === String(row.carModelId));
  const modelName = model?.ten_xe || "";
  const brand = row.brand || "";
  const years =
    row.year_from && row.year_to ? ` (${row.year_from}–${row.year_to})` : "";
  return `${brand} ${modelName}${years}`.trim();
}

export function isCarRowComplete(row) {
  return Boolean(row?.carModelId && row?.year_from && row?.year_to);
}

export function flushProductDraft(productId, snapshot) {
  const key = productId ? `otofine.draft.${productId}` : "otofine.draft.new";
  localStorage.setItem(
    key,
    JSON.stringify({
      v: 1,
      savedAt: new Date().toISOString(),
      data: snapshot,
    }),
  );
}
