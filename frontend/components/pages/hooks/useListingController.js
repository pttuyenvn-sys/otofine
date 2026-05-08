import { useMemo, useState } from "react";
import { buildListingState } from "@/lib/seo/listingStateEngine.js";

function buildBusinessPageTitle({ category, brand, model, year, location }) {
  const hasCategory = !!String(category || "").trim();
  const loc = String(location || "").trim();

  // 👉 Trang chủ
  if (!category && !brand && !model && !year && !location) {
    return "Phụ tùng ô tô chính hãng giá tốt";
  }

  // 👉 Chỉ có category
  if (hasCategory && !brand && !model && !year && !location) {
    return `${category} ô tô`;
  }

  const parts = [];

  // 👉 Có category → KHÔNG dùng "Phụ tùng"
  if (hasCategory) {
    parts.push(category);
  } else {
    parts.push("Phụ tùng");
  }

  if (brand) parts.push(brand);
  if (model) parts.push(model);
  if (year) parts.push(year);

  let title = parts.join(" ");

  if (loc) {
    title += ` tại ${loc}`;
  }

  return title;
}

export function useListingController() {
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [location, setLocation] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("popular");

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
    const base = buildListingState(state);
    return {
      ...base,
      h1: buildBusinessPageTitle(state),
    };
  }, [category, brand, model, year, location, keyword, page, sort]);

  const pageTitle = listingState.h1;
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
    location,
    setLocation,
    keyword,
    setKeyword,
    page,
    setPage,
    sort,
    setSort,
    pageTitle,
    tier,
    tierLabel,
    listingState,
  };
}