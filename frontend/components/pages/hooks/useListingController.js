import { useMemo, useState } from "react";
import { buildListingState } from "@/lib/seo/listingStateEngine.js";
import { splitSeoYearFromLegacy } from "@/components/pages/home/services/yearState";

/**
 * Scroll/navigation state key from URL-owned filter dimensions (ARCH-MP-03B.9).
 */
export function buildListingNavigationStateKey({
  category = "",
  brand = "",
  model = "",
  year = "",
  location = "",
  keyword = "",
  page = 1,
  sort = "",
} = {}) {
  return JSON.stringify({
    category: String(category).trim(),
    brand: String(brand).trim(),
    model: String(model).trim(),
    year: String(year ?? "").trim(),
    location: String(location).trim(),
    keyword: String(keyword ?? "").trim(),
    page: Math.max(1, Number(page) || 1),
    sort: String(sort ?? "").trim(),
  });
}

export function useListingController(
  initialVehicleFilter = null,
  initialKeyword = "",
  initialLandingFilters = null,
) {
  const parsed = initialVehicleFilter?.parsed;
  const landing = initialLandingFilters || {};
  const [category, setCategory] = useState(
    landing?.category ? String(landing.category) : "",
  );
  const [brand, setBrand] = useState(
    landing?.brand ? String(landing.brand) : parsed?.brand ? String(parsed.brand) : "",
  );
  const [model, setModel] = useState(
    landing?.model ? String(landing.model) : parsed?.model ? String(parsed.model) : "",
  );
  const [year, setYear] = useState(
    landing?.year != null && landing?.year !== ""
      ? String(landing.year)
      : parsed?.year != null && parsed?.year !== ""
        ? String(parsed.year)
        : "",
  );
  const [location, setLocation] = useState(
    landing?.location
      ? String(landing.location)
      : parsed?.locationName
        ? String(parsed.locationName)
        : "",
  );
  const [keyword, setKeyword] = useState(String(initialKeyword || ""));
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("popular");

  const { yearFrom, yearTo } = useMemo(
    () => splitSeoYearFromLegacy(year),
    [year],
  );

  const state = {
    category,
    brand,
    model,
    year,
    location,
    keyword,
    page,
    sort,
  };

  const listingState = useMemo(() => {
    const tierState = buildListingState({
      ...state,
      year,
    });

    return {
      tier: tierState.tier,
      tierLabel: tierState.tierLabel,
      stateKey: buildListingNavigationStateKey({
        category,
        brand,
        model,
        year,
        location,
        keyword,
        page,
        sort,
      }),
    };
  }, [
    category,
    brand,
    model,
    year,
    location,
    keyword,
    page,
    sort,
  ]);

  const tier = listingState.tier;
  const tierLabel = listingState.tierLabel;

  return {
    category,
    setCategory,
    brand,
    setBrand,
    model,
    setModel,
    year,
    setYear,
    yearFrom,
    yearTo,
    location,
    setLocation,
    keyword,
    setKeyword,
    page,
    setPage,
    sort,
    setSort,
    tier,
    tierLabel,
    listingState,
  };
}
