import { buildHomePageTitle, EMPTY_HOME_FILTERS } from "@/lib/seo/homePageTitle";
import { buildHomeListingUrl } from "@/lib/seo/parseHomeListingSlug";

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
 *   selectedCategory?: string,
 *   filters?: Record<string, string> | null,
 *   page?: number,
 *   keyword?: string,
 *   sort?: string,
 * }} input
 */
export function buildListingState({
  selectedCategory,
  filters,
  page = 1,
  keyword = "",
  sort = "",
}) {
  const cat = String(selectedCategory ?? "").trim();
  const nf = normalizeFilters(filters);
  const kw = String(keyword ?? "").trim();
  const st = String(sort ?? "").trim();
  const p = Math.max(1, Number(page) || 1);

  const h1 = buildHomePageTitle(cat, nf);
  const url = buildHomeListingUrl(h1, { q: kw, page: p });

  const qMark = url.indexOf("?");
  const slug = (qMark === -1 ? url : url.slice(0, qMark)) || "/";
  /** With leading "?"; empty when no query segment (e.g. "" or "?q=a&page=2"). */
  const queryString = qMark === -1 ? "" : `?${url.slice(qMark + 1)}`;

  const stateKey = JSON.stringify({
    selectedCategory: cat,
    filters: nf,
    page: p,
    keyword: kw,
    sort: st,
  });

  return {
    h1,
    url,
    slug,
    queryString,
    stateKey,
  };
}
