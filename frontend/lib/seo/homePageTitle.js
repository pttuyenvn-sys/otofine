/**
 * H1 trang listing Home — dùng chung client + server (metadata).
 */
export const EMPTY_HOME_FILTERS = {
  brand: "",
  model: "",
  year: "",
  engine: "",
  displacement: "",
  transmission: "",
  drivetrain: "",
  bodyType: "",
};

/**
 * Hãng / dòng / năm / thông số — dùng chung với H1, SEO registry, tier.
 * @param {Record<string, string>} [filters]
 */
export function hasListingVehicleOrSpecFilters(filters) {
  const f = filters || {};
  return !!(
    f.brand ||
    f.model ||
    (f.year != null && String(f.year).trim() !== "") ||
    f.engine ||
    f.displacement ||
    f.transmission ||
    f.drivetrain ||
    f.bodyType
  );
}

/**
 * @param {string} [selectedCategory]
 * @param {Record<string, string>} [filters]
 */
export function buildHomePageTitle(selectedCategory, filters) {
  const f = filters || {};
  const hasVehicle = hasListingVehicleOrSpecFilters(f);

  const tail = [
    f.brand,
    f.model,
    f.year != null && String(f.year).trim() !== "" ? String(f.year) : "",
    f.engine,
    f.displacement,
    f.transmission,
    f.drivetrain,
    f.bodyType,
  ].filter((x) => x != null && String(x).trim() !== "");

  const cat = (selectedCategory || "").trim();

  if (!hasVehicle && !cat) {
    return "Phụ tùng ô tô";
  }

  if (!hasVehicle && cat) {
    return `${cat} ô tô`;
  }

  if (hasVehicle && cat) {
    return [cat, ...tail].join(" ");
  }

  return ["Phụ tùng ô tô", ...tail].join(" ");
}
