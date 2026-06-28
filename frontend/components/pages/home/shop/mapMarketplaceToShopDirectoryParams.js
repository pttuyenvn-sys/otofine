import { deriveSelectedCityFromLocation } from "@/components/pages/home/services/locationState";

function buildDirectoryHref(query = {}) {
  const params = new URLSearchParams();
  if (query.brand) params.set("brand", query.brand);
  if (query.provinceSlug) params.set("province", query.provinceSlug);
  const qs = params.toString();
  return qs ? `/shops?${qs}` : "/shops";
}

/**
 * Map current marketplace filter state → shop directory presentation + query.
 * Category, model, year are intentionally excluded (directory API scope).
 *
 * @param {{ brand?: string, location?: string, availableLocations?: Array<{ name?: string, slug?: string }> }} input
 * @returns {{ title: string, subtitle: string | null, query: { brand?: string, provinceSlug?: string }, directoryHref: string }}
 */
export function mapMarketplaceToShopDirectoryParams({
  brand = "",
  location = "",
  availableLocations = [],
} = {}) {
  const brandVal = String(brand || "").trim();
  const selectedCity = deriveSelectedCityFromLocation(location, availableLocations);
  const provinceSlug = selectedCity?.slug
    ? String(selectedCity.slug).trim().toLowerCase()
    : "";
  const provinceName = selectedCity?.name
    ? String(selectedCity.name).replace(/^TP\s+/i, "").trim()
    : "";

  /** @type {{ brand?: string, provinceSlug?: string }} */
  const query = {};
  if (brandVal) query.brand = brandVal;
  if (provinceSlug) query.provinceSlug = provinceSlug;

  let title = "Shop nổi bật";
  let subtitle = null;

  if (brandVal && provinceName) {
    title = `Shop ${brandVal} tại ${provinceName}`;
    subtitle = `${brandVal} · ${provinceName}`;
  } else if (brandVal) {
    title = `Shop chuyên ${brandVal}`;
    subtitle = brandVal;
  } else if (provinceName) {
    title = `Shop tại ${provinceName}`;
    subtitle = provinceName;
  }

  return {
    title,
    subtitle,
    query,
    directoryHref: buildDirectoryHref(query),
  };
}

export { buildDirectoryHref };
