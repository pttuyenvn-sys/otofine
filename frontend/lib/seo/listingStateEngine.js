import { classifyListingTier, EMPTY_HOME_FILTERS } from "@/lib/seo/homePageTitle";

/**
 * @param {Record<string, string> | undefined | null} filters
 * @returns {typeof EMPTY_HOME_FILTERS}
 */
function normalizeFilters(filters) {
  /** @type {typeof EMPTY_HOME_FILTERS} */
  const out = { ...EMPTY_HOME_FILTERS };
  if (!filters || typeof filters !== "object") return out;
  for (const k of Object.keys(EMPTY_HOME_FILTERS)) {
    if (Object.prototype.hasOwnProperty.call(filters, k) && filters[k] != null) {
      out[k] = String(filters[k]).trim();
    }
  }
  return out;
}

/**
 * @param {{
 *   category?: string,
 *   brand?: string,
 *   model?: string,
 *   year?: string,
 *   location?: string,
 *   keyword?: string,
 *   page?: number,
 *   sort?: string,
 * }} input
 */
export function buildListingState({
  category = "",
  brand = "",
  model = "",
  year = "",
  location = "",
  keyword = "",
  page = 1,
  sort = "",
}) {
  const cat = String(category).trim();
  const br = String(brand).trim();
  const mo = String(model).trim();
  const yr = String(year).trim();
  const loc = String(location).trim();
  const kw = String(keyword).trim();
  const st = String(sort).trim();
  const p = Math.max(1, Number(page) || 1);

  const state = {
    category: cat,
    brand: br,
    model: mo,
    year: yr,
    location: loc,
  };

  const { tier, label: tierLabel } = classifyListingTier(state);

  const stateKey = JSON.stringify({
    category: cat,
    brand: br,
    model: mo,
    year: yr,
    location: loc,
    keyword: kw,
    page: p,
    sort: st,
  });

  return {
    tier,
    tierLabel,
    stateKey,
  };
}
