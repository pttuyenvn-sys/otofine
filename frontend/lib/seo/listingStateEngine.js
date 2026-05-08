import { buildHomePageTitle, classifyListingTier, EMPTY_HOME_FILTERS } from "@/lib/seo/homePageTitle";
import { buildUrlFromH1 } from "@/lib/seo/parseHomeListingSlug";

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

  const h1 = buildHomePageTitle(state);
  const { tier, label: tierLabel } = classifyListingTier(state);
  const url = buildUrlFromH1(h1, { q: kw, page: p });

  const qMark = url.indexOf("?");
  const slug = (qMark === -1 ? url : url.slice(0, qMark)) || "/";
  const queryString = qMark === -1 ? "" : `?${url.slice(qMark + 1)}`;

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
    h1,
    tier,
    tierLabel,
    url,
    slug,
    queryString,
    stateKey,
  };
}
