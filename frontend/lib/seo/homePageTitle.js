/**
 * H1 trang listing Home — dùng chung client + server (metadata).
 *
 * Tier priority (highest → lowest):
 *   1 = part + car + year + city   "Má phanh Toyota Camry 2020 tại HCM"
 *   2 = part + car + year          "Má phanh Toyota Camry 2020"
 *   3 = part + car                 "Má phanh Toyota Camry"
 *   4 = car only                   "Phụ tùng Toyota Vios 2018"
 *   5 = part only                  "Má phanh ô tô"
 *   6 = city only                  "Phụ tùng ô tô tại Hà Nội"
 *   7 = homepage                   "Phụ tùng ô tô chính hãng giá tốt"
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
  city: "",
};

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
 * Classify the current listing context into a SEO tier.
 * @param {{
 *   category?: string,
 *   brand?: string,
 *   model?: string,
 *   year?: string,
 *   location?: string,
 * }} state
 * @returns {{ tier: number, label: string }}
 */
export function classifyListingTier(state) {
  const cat = (state.category || "").trim();
  const hasCar = !!(state.brand || state.model);
  const hasYear = !!(state.year != null && String(state.year).trim() !== "");
  const hasCity = !!(state.location && String(state.location).trim());

  if (cat && hasCar && hasYear && hasCity) return { tier: 1, label: "part_car_year_city" };
  if (cat && hasCar && hasYear) return { tier: 2, label: "part_car_year" };
  if (cat && hasCar) return { tier: 3, label: "part_car" };
  if (hasCar) return { tier: 4, label: "car_only" };
  if (cat) return { tier: 5, label: "part_only" };
  if (hasCity) return { tier: 6, label: "city_only" };
  return { tier: 7, label: "homepage" };
}

/**
 * @param {{
 *   category?: string,
 *   brand?: string,
 *   model?: string,
 *   year?: string,
 *   location?: string,
 * }} state
 */
export function buildHomePageTitle(state) {
  const cat = (state.category || "").trim();
  const { tier } = classifyListingTier(state);
  const city = (state.location || "").trim();

  const vehicleParts = [
    state.brand,
    state.model,
    state.year != null && String(state.year).trim() !== "" ? String(state.year) : "",
  ].filter((x) => x != null && String(x).trim() !== "");

  const tail = vehicleParts;
  const cityTail = city ? ` tại ${city}` : "";

  switch (tier) {
    case 1: // part + car + year + city
      return `${cat} ${tail.join(" ")}${cityTail}`;
    case 2: // part + car + year
      return `${cat} ${tail.join(" ")}`;
    case 3: // part + car
      return [cat, ...tail].join(" ");
    case 4: // car only
      return `Phụ tùng ${tail.join(" ")}${cityTail}`;
    case 5: // part only
      return `${cat} ô tô${cityTail}`;
    case 6: // city only
      return `Phụ tùng ô tô tại ${city}`;
    case 7: // homepage
    default:
      return "Phụ tùng ô tô chính hãng giá tốt";
  }
}
