import { useMemo, useState } from "react";
import { EMPTY_HOME_FILTERS } from "@/lib/seo/homePageTitle";
import { buildListingState } from "@/lib/seo/listingStateEngine.js";

const EMPTY_FILTERS = EMPTY_HOME_FILTERS;

export function useListingController(props = {}) {
  const { initialFromSlug = null, seoListingContext = null } = props;

  const initialUserIntentCategory = String(
    initialFromSlug?.selectedCategory ??
      seoListingContext?.categoryName ??
      "",
  ).trim();

  const [selectedCategory, setSelectedCategory] = useState(() =>
    initialUserIntentCategory,
  );

  const [filters, setFilters] = useState(() => {
    if (seoListingContext) return { ...EMPTY_FILTERS };
    if (initialFromSlug?.filters) {
      return { ...EMPTY_FILTERS, ...initialFromSlug.filters };
    }
    return { ...EMPTY_FILTERS };
  });

  const [page, setPage] = useState(1);
  const [committedKeyword, setCommittedKeyword] = useState("");
  const [listSort, setListSort] = useState("popular");

  const listingState = useMemo(
    () =>
      buildListingState({
        selectedCategory,
        filters,
        page,
        keyword: committedKeyword,
        sort: listSort,
      }),
    [selectedCategory, filters, page, committedKeyword, listSort],
  );

  const pageTitle = listingState.h1;

  const currentListingUrl = listingState.url;

  return {
    selectedCategory,
    setSelectedCategory,
    filters,
    setFilters,
    page,
    setPage,
    committedKeyword,
    setCommittedKeyword,
    listSort,
    setListSort,
    pageTitle,
    listingState,
    currentListingUrl,
  };
}
