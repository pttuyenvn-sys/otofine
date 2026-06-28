/**
 * Category × brand owner page (brand facet, no model/year/location).
 *
 * @param {{ kind?: string, categoryMeta?: object | null } | null | undefined} entity
 * @returns {boolean}
 */
export function isCategoryBrandDiscoveryPage(entity) {
  if (entity?.kind !== "category") return false;

  const meta = entity.categoryMeta;
  if (!meta || meta.isPartVehicle) return false;

  const brand = String(meta.cbmBrand || "").trim();
  if (!brand) return false;

  if (String(meta.cbmModel || "").trim()) return false;
  if (String(meta.cbmYear || "").trim()) return false;
  if (String(meta.cbmLocation || "").trim()) return false;

  return Boolean(
    String(meta.canonicalName || meta.categoryName || "").trim(),
  );
}
