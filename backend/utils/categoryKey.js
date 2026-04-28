/** Chuẩn hoá partName để filter category (gần SQL REGEXP_REPLACE + LOWER). */
export function sqlCategoryKeyFromPartName(partName) {
  return String(partName || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
