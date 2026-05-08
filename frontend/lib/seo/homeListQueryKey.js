import { EMPTY_HOME_FILTERS } from "@/lib/seo/homePageTitle";

/**
 * Một nguồn duy nhất: khóa ổn định cho bộ lọc listing Home (trùng với `listQueryKey` cũ).
 * @param {{
 *  page: number,
 *  searchTrigger?: number,
 *  committedKeyword?: string,
 *  listSort: string,
 *  selectedCategory: string,
 *  filters: typeof EMPTY_HOME_FILTERS
 * }} s
 */
export function buildHomeListQueryKey(s) {
  const f = s?.filters && typeof s.filters === "object" ? s.filters : EMPTY_HOME_FILTERS;
  return [
    s.page,
    s.searchTrigger ?? 0,
    (s.committedKeyword ?? "").trim(),
    s.listSort,
    s.selectedCategory,
    f.brand,
    f.model,
    f.year,
    f.engine,
    f.displacement,
    f.transmission,
    f.drivetrain,
    f.bodyType,
    f.city,
  ].join("\0");
}
