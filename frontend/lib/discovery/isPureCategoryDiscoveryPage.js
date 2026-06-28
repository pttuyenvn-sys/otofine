/**
 * Pure category owner page (no brand/model/year/location facet).
 *
 * @param {{ kind?: string, categoryMeta?: object | null } | null | undefined} entity
 * @returns {boolean}
 */
export function isPureCategoryDiscoveryPage(entity) {
  if (entity?.kind !== "category") return false;

  const meta = entity.categoryMeta;
  if (!meta || meta.isPartVehicle || meta.isCbmy) return false;
  if (meta.cbmBrand || meta.cbmModel || meta.cbmYear || meta.cbmLocation) {
    return false;
  }

  return Boolean(
    String(meta.canonicalName || meta.categoryName || "").trim(),
  );
}
