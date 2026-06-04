"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  startTransition,
} from "react";
import { FiClock, FiPhoneCall } from "react-icons/fi";
// Link import kept for other usage in file, leave untouched
import Link from "next/link";
import { getProductDetailHref } from "@/lib/productDetailHref";
import { API_BASE } from "@/lib/config";
import { fetchJsonCached } from "@/lib/clientJsonCache";
import { getApiList } from "@/lib/vehicle/vehicleFilterApi";
import {
  buildHomePageTitle,
} from "@/lib/seo/homePageTitle";
import {
  FALLBACK_SEO_TOP_BRANDS,
  FALLBACK_SEO_HOT_MODELS,
  mergeBrandNamesToLength,
  mergeModelRowsToLength,
} from "@/lib/seo/vehicleSeoChips";
import {
  buildDynamicListingSeoContent,
} from "@/lib/seo/dynamicListingSeoComposer";
import { useListingController } from "@/components/pages/hooks/useListingController";
import HomeHeader from "@/components/pages/home/HomeHeader";
import HomeSearch from "@/components/pages/home/HomeSearch";
// Remove any notion of filters/slug logic from PopularCategoriesBox.
// Usage must only have onCtaClick and needed UI display props.
import PopularCategoriesBox from "@/components/pages/home/PopularCategoriesBox";
import LeftNav from "@/components/pages/home/LeftNav";
import ProductGridWrapper from "@/components/pages/home/ProductGridWrapper";
import { SearchSuggestThumb } from "@/components/pages/home/HomeImages";
import SearchSuggestPanel from "@/components/pages/home/SearchSuggestPanel";
import { HomeProductCard } from "@/components/pages/home/HomeProductCard";
import VehicleQuickPanel from "@/components/pages/home/VehicleQuickPanel";
import PartKnowledgeSeoPage from "@/components/seo/PartKnowledgeSeoPage";
import SeoContent from "@/components/pages/home/SeoContent";
import "@/components/seo/seo-landing.css";
import "./Home.css";
import ListingHero from "@/components/pages/home/ListingHero";
import FilterBar from "@/components/pages/home/FilterBar";

// ===== CANONICAL URL SYNC HELPERS =====
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Temporary instrumentation: trace client-side route mutations (logs only).
// Remove after debugging.
function installClientRoutingTrace(router) {
  if (typeof window === "undefined") return () => {};
  try {
    const origPush = router.push.bind(router);
    const origReplace = router.replace.bind(router);
    router.push = (...args) => {
      try {
        // eslint-disable-next-line no-console
        console.warn("[RouterTrace] push", { args, stack: new Error().stack });
      } catch {}
      return origPush(...args);
    };
    router.replace = (...args) => {
      try {
        // eslint-disable-next-line no-console
        console.warn("[RouterTrace] replace", { args, stack: new Error().stack });
      } catch {}
      return origReplace(...args);
    };
    const origPushState = window.history.pushState.bind(window.history);
    const origReplaceState = window.history.replaceState.bind(window.history);
    window.history.pushState = (state, title, url) => {
      try {
        // eslint-disable-next-line no-console
        console.warn("[HistoryTrace] pushState", { state, title, url, stack: new Error().stack });
      } catch {}
      return origPushState(state, title, url);
    };
    window.history.replaceState = (state, title, url) => {
      try {
        // eslint-disable-next-line no-console
        console.warn("[HistoryTrace] replaceState", { state, title, url, stack: new Error().stack });
      } catch {}
      return origReplaceState(state, title, url);
    };
    const onPop = (e) => {
      try {
        // eslint-disable-next-line no-console
        console.warn("[HistoryTrace] popstate", { state: window.history.state, stack: new Error().stack });
      } catch {}
    };
    window.addEventListener("popstate", onPop);
    return () => {
      try {
        router.push = origPush;
        router.replace = origReplace;
        window.history.pushState = origPushState;
        window.history.replaceState = origReplaceState;
        window.removeEventListener("popstate", onPop);
      } catch {}
    };
  } catch {
    return () => {};
  }
}
function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .trim();
}

function displayFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

function rowName(row) {
  return String(row?.canonical_name || row?.category_name || row?.name || row?.brand || row || "").trim();
}

function cleanQueryValue(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const low = trimmed.toLowerCase();
    if (low === "null" || low === "undefined") return null;
    return trimmed;
  }
  return value;
}

function buildDbBackedPageTitle({ categoryName, hasCategory, brand, model, year, location }) {
  const loc = String(location || "").trim();

  if (!hasCategory && !brand && !model && !year && !loc) {
    return "Phụ tùng ô tô chính hãng giá tốt";
  }

  if (hasCategory && !brand && !model && !year && !loc) {
    return `${categoryName} ô tô`;
  }

  const parts = [hasCategory ? categoryName : "Phụ tùng"];
  if (brand) parts.push(brand);
  if (model) parts.push(model);
  if (year) parts.push(year);

  let title = parts.filter(Boolean).join(" ");
  if (loc) title += ` tại ${loc}`;
  return title;
}

const KNOWN_VEHICLE_BRANDS = [
  "toyota",
  "kia",
  "mazda",
  "honda",
  "hyundai",
  "ford",
  "mitsubishi",
  "nissan",
  "suzuki",
  "chevrolet",
  "isuzu",
  "mercedes-benz",
  "mercedes",
  "bmw",
  "audi",
  "lexus",
  "vinfast",
  "peugeot",
  "volkswagen",
  "subaru",
  "volvo",
  "daewoo",
];

function buildPathFromState({ category, brand, model, year, location }) {
  const parts = [];
  const hasCategory = !!String(category || "").trim();
  const hasContext = !!(brand || model || year || location);

  if (hasCategory) {
    parts.push(slugify(category));
    if (!hasContext) parts.push("o-to");
  } else if (hasContext) {
    parts.push("phu-tung");
  }

  if (brand) parts.push(slugify(brand));
  if (model) parts.push(slugify(model));
  if (year) parts.push(String(year));

  if (location) {
    parts.push("tai");
    parts.push(slugify(location));
  }

  const slug = parts.filter(Boolean).join("-");
  return slug ? `/${slug}` : "/";
}

function parseUrlState(pathname, { categories = [], brands = [], locations = [], vehicleHot = null } = {}) {
  const rawSlug = String(pathname || "").replace(/^\//, "").replace(/\/$/, "");

  if (!rawSlug) {
    return { category: "", brand: "", model: "", year: "", location: "" };
  }

  let tokens = rawSlug.split("-").filter(Boolean);
  let location = "";
  const taiIndex = tokens.lastIndexOf("tai");
  if (taiIndex >= 0) {
    const locSlug = tokens.slice(taiIndex + 1).join("-");
    const loc = locations.find((x) => x?.slug === locSlug || slugify(String(x?.name || "").replace(/^TP\s+/i, "")) === locSlug);
    location = loc?.name ? String(loc.name).replace(/^TP\s+/i, "").trim() : displayFromSlug(locSlug);
    tokens = tokens.slice(0, taiIndex);
  }

  let year = "";
  if (/^(19|20)\d{2}$/.test(tokens[tokens.length - 1] || "")) {
    year = tokens.pop();
  }

  let category = "";
  let isPartVehicle = false;
  let categoryRows = [];
  if (tokens[0] === "phu" && tokens[1] === "tung") {
    isPartVehicle = true;
    tokens = tokens.slice(2);
  }

  if (!isPartVehicle) {
    categoryRows = categories
      .map((row) => ({ row, name: rowName(row), slug: slugify(rowName(row)) }))
      .filter((x) => x.slug)
      .sort((a, b) => b.slug.length - a.slug.length);
    const joined = tokens.join("-");
    const match = categoryRows.find((x) =>
      joined === x.slug ||
      joined === `${x.slug}-o-to` ||
      joined.startsWith(`${x.slug}-`)
    );
    if (match) {
      category = match.name;
      tokens = tokens.slice(match.slug.split("-").length);
      if (tokens[0] === "o" && tokens[1] === "to") tokens = tokens.slice(2);
    } else if (joined.endsWith("-o-to")) {
      const rawSlug = joined.replace(/-o-to$/, "");

      const exactMatch = categoryRows.find(
        (x) => x.slug === rawSlug
      );

      category = exactMatch?.name || displayFromSlug(rawSlug);

      tokens = [];
    }
  }

  const brandRows = brands
    .map((row) => ({ name: rowName(row), slug: slugify(rowName(row)) }))
    .filter((x) => x.slug)
    .sort((a, b) => b.slug.length - a.slug.length);
  const knownBrandRows = KNOWN_VEHICLE_BRANDS.map((name) => ({
    name: displayFromSlug(name),
    slug: slugify(name),
  }));
  const allBrandRows = [...brandRows, ...knownBrandRows].sort(
    (a, b) => b.slug.length - a.slug.length,
  );
  const rest = tokens.join("-");
  let brandStartIndex = 0;
  let brandMatch = allBrandRows.find(
    (x) => rest === x.slug || rest.startsWith(`${x.slug}-`),
  );
  if (!brandMatch && !isPartVehicle) {
    for (let i = 1; i < tokens.length; i += 1) {
      const tail = tokens.slice(i).join("-");

      const match = allBrandRows.find(
        (x) => tail === x.slug || tail.startsWith(`${x.slug}-`)
      );

      if (match) {
        brandMatch = match;
        brandStartIndex = i;

        if (!category) {
          const categorySlug = tokens.slice(0, i).join("-");

          const categoryMatch = categoryRows.find(
            (x) => x.slug === categorySlug
          );

          category =
            categoryMatch?.name ||
            displayFromSlug(categorySlug);
        }
      }
    }
  }

  const brand =
    brandMatch?.name ||
    (brandMatch?.slug ? displayFromSlug(brandMatch.slug) : "");

  if (brandMatch) {
    tokens = tokens.slice(
      brandMatch.slug.split("-").length
    );
  }

  const modelSlug = tokens.join("-");

  const modelRows = vehicleHot?.modelRows || [];

  const modelMatch = modelRows.find((row) => {
    const sameBrand =
      !brand ||
      String(row.brand || "").toLowerCase() ===
      String(brand).toLowerCase();

    return (
      sameBrand &&
      slugify(row.model) === slugify(modelSlug)
    );
  });

  const model =
    modelMatch?.model ||
    (modelSlug ? displayFromSlug(modelSlug) : "");

  const parsedState = {
    category,
    brand,
    model,
    year,
    location,
  };

  console.log("PARSED FILTER", parsedState);

  return parsedState;
}
// ===== END HELPERS =====

export { buildHomePageTitle };

const SUGGEST_FETCH_DEBOUNCE_MS = 200;
const RECENT_SEARCHES_KEY = "otofine_recent_searches_v1";
const QUICK_VEHICLE_STORAGE_KEY = "otofine_vehicle_quick_v1";
const MOBILE_VEHICLE_PANEL_OPEN_KEY = "otofine_mobile_vehicle_panel_open_v1";

/** Gợi ý nhanh — đồng bộ tone phụ tùng ô tô */
const HOT_KEYWORDS = [
  "Má phanh",
  "Lọc gió động cơ",
  "Giảm xóc",
  "Càng A",
  "Đèn pha",
  "Ắc quy",
  "Dầu nhớt",
  "Bu gi",
];

/** 4 keyword neo — luôn đứng đầu block “Tìm nhanh phổ biến” */
const SEARCH_POPULAR_ANCHORS = new Set(HOT_KEYWORDS.slice(0, 4));
const PRODUCT_INTENT_ALIAS_MAP = {
  "can truoc": ["Ba đờ sốc trước", "Bumper trước"],
  "can sau": ["Ba đờ sốc sau", "Bumper sau"],
  "ba do soc truoc": ["Cản trước", "Bumper trước"],
  "ba do soc sau": ["Cản sau", "Bumper sau"],
};

function removeVietnamese(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function buildProductIntent(rawCategory, displayH1) {
  const raw = String(rawCategory || "").trim();
  const h1Term = String(displayH1 || "").trim();
  const seed = raw || h1Term;
  if (!seed) return { raw: "", variants: [] };
  const normalized = removeVietnamese(seed).replace(/\s+/g, " ").trim();
  const variants = [];
  const seen = new Set();
  const push = (v) => {
    const s = String(v || "").trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    variants.push(s);
  };
  if (raw) push(raw);
  if (h1Term) push(h1Term);
  const aliases = PRODUCT_INTENT_ALIAS_MAP[normalized] || [];
  aliases.forEach(push);
  if (normalized !== seed.toLowerCase()) {
    push(normalized);
  }
  return { raw: seed, variants };
}

export default function Home({
  premiumArticle = null,
  initialVehicleFilter = null,
} = {}) {
  // SYSTEM: STATE is the ONLY source of truth for filters
  const pathname = usePathname() || "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const keywordFromUrl = searchParams.get("keyword") || "";
  const slug = pathname.replace(/^\//, "");
  const [seoData, setSeoData] = useState(null);
  const finalSeoData =
    seoData || premiumArticle;
  const seoArticleSlug = slug;

  const [open, setOpen] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mobileFilter, setMobileFilter] = useState(false);
  const [mobileQuote, setMobileQuote] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState("");
  const {
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
    tier,
    tierLabel,
    listingState,
  } = useListingController();

  const [brands, setBrands] = useState([]);
  const [seoVehicleHot, setSeoVehicleHot] = useState(null);
  const [models, setModels] = useState([]);
  const [years, setYears] = useState([]);
  const [specs, setSpecs] = useState({
    engine: [],
    gearbox: [],
    drivetrain: [],
    bodyType: [],
    cc: [],
  });
  const [categories, setCategories] = useState([]);

  const [availableLocations, setAvailableLocations] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const cityDropdownRef = useRef(null);

  const [products, setProducts] = useState([]);
  const lastFetchKeyRef = useRef(null);
  const isFirstLoadUrlStateRef = useRef(true);
  const [listError, setListError] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [listBootstrapping, setListBootstrapping] = useState(true);
  const [contactPhone, setContactPhone] = useState("");
  const textMeasureRef = useRef(null);
  const productListAnchorRef = useRef(null);
  const skipProductScrollRef = useRef(true);
  const [suggestItems, setSuggestItems] = useState([]);
  const [, setSuggestLoading] = useState(false);
  const [suggestPanelOpen, setSuggestPanelOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [leftPopularOpen, setLeftPopularOpen] = useState(false);
  const [leftRecentOpen, setLeftRecentOpen] = useState(false);

  // Quick Filter UI
  const [quickStep, setQuickStep] = useState(1);
  const [quickDraft, setQuickDraft] = useState({
    brand: "",
    model: "",
    year: "",
  });
  const [draftModels, setDraftModels] = useState([]);
  const [draftModelsLoading, setDraftModelsLoading] = useState(false);
  const [draftYears, setDraftYears] = useState([]);
  const [draftYearsLoading, setDraftYearsLoading] = useState(false);

  const dbCategoryName = useMemo(() => {
    const categorySlug = slugify(category);
    if (!categorySlug) return "";

    const match = (categories || []).find((row) => {
      const name = rowName(row);
      const slugs = [
        name,
        row?.canonical_slug,
        row?.category_slug,
        row?.slug,
      ]
        .map(slugify)
        .filter(Boolean);
      return slugs.some((value) => value === categorySlug || value.replace(/-o-to$/, "") === categorySlug);
    });

    return match ? rowName(match) : category;
  }, [categories, category]);

  const dbLocationName = useMemo(() => {
    const locationSlug = slugify(location);
    if (!locationSlug) return "";

    const match = (availableLocations || []).find((row) => {
      const name = String(row?.name || "").replace(/^TP\s+/i, "").trim();
      const slugs = [name, row?.slug].map(slugify).filter(Boolean);
      return slugs.includes(locationSlug);
    });

    return match?.name ? String(match.name).replace(/^TP\s+/i, "").trim() : location;
  }, [availableLocations, location]);

  const pageTitle = useMemo(
    () =>
      buildDbBackedPageTitle({
        categoryName: dbCategoryName,
        hasCategory: Boolean(String(category || "").trim()),
        brand,
        model,
        year,
        location: dbLocationName,
      }),
    [dbCategoryName, category, brand, model, year, dbLocationName],
  );

  const urlState = useMemo(
    () => ({ category, brand, model, year, location }),
    [category, brand, model, year, location],
  );

  // install routing trace once after router is available
  useEffect(() => {
    if (!router) return;
    const uninstall = installClientRoutingTrace(router);
    return () => uninstall();
  }, [router]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(MOBILE_VEHICLE_PANEL_OPEN_KEY) !== "1") return;
      setMobileFilter(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!mobileFilter) return;
    try {
      sessionStorage.setItem(MOBILE_VEHICLE_PANEL_OPEN_KEY, "1");
    } catch {
      // ignore
    }
  }, [mobileFilter]);

  const closeMobileVehiclePanel = useCallback(() => {
    try {
      sessionStorage.removeItem(MOBILE_VEHICLE_PANEL_OPEN_KEY);
    } catch {
      // ignore
    }
    setMobileFilter(false);
  }, []);

  const navigateToState = useCallback(
    (patch, options = {}) => {
      const { skipRouteUpdate = false } = options;
      const nextState = { ...urlState, ...patch };
      console.log("SET FILTER:", nextState);
      if (Object.prototype.hasOwnProperty.call(patch, "category")) {
        setCategory(nextState.category || "");
      }
      if (Object.prototype.hasOwnProperty.call(patch, "brand")) {
        setBrand(nextState.brand || "");
      }
      if (Object.prototype.hasOwnProperty.call(patch, "model")) {
        setModel(nextState.model || "");
      }
      if (Object.prototype.hasOwnProperty.call(patch, "year")) {
        setYear(nextState.year || "");
      }
      if (Object.prototype.hasOwnProperty.call(patch, "location")) {
        setLocation(nextState.location || "");
      }

      if (!skipRouteUpdate) {
        const newUrl = buildPathFromState(nextState);
        if (window.location.pathname !== newUrl) {
          router.replace(newUrl, { scroll: false });
        }
      }
    },
    [router, urlState, setCategory, setBrand, setModel, setYear, setLocation],
  );

  useEffect(() => {
    if (!isFirstLoadUrlStateRef.current) return;

    if (
      !brands.length ||
      !categories.length ||
      !seoVehicleHot?.modelRows?.length
    ) {
      return;
    }

    let parsed;

    // 🔥 ưu tiên server SEO context
    if (initialVehicleFilter?.parsed) {
      parsed = {
        category: "",
        brand: initialVehicleFilter.parsed.brand || "",
        model: initialVehicleFilter.parsed.model || "",
        year: initialVehicleFilter.parsed.year
          ? String(initialVehicleFilter.parsed.year)
          : "",
        location:
          initialVehicleFilter.parsed.locationName || "",
      };
    } else {
      parsed = parseUrlState(pathname, {
        categories,
        brands,
        locations: availableLocations,
        vehicleHot: seoVehicleHot,
      });
    }

    isFirstLoadUrlStateRef.current = false;

    startTransition(() => {
      setCategory(parsed.category || "");
      setBrand(parsed.brand || "");
      setModel(parsed.model || "");
      setYear(parsed.year || "");
      setLocation(parsed.location || "");

      setKeyword(keywordFromUrl);

      setPage(1);
    });

  }, [
    pathname,
    keywordFromUrl,
    categories,
    brands,
    availableLocations,
    seoVehicleHot,
    initialVehicleFilter,
  ]);


  useEffect(() => {
    const activeSlug = String(slug || "").trim().replace(/^\//, "");
    if (!activeSlug) {
      setSeoData(null);
      return;
    }

    let cancelled = false;

    async function fetchSeo() {
      try {
        const res = await fetch(
          `${API_BASE}/seo-page/${encodeURIComponent(activeSlug)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setSeoData(null);
          return;
        }
        const json = await res.json();
        if (!cancelled) setSeoData(json);
        console.log("SEO CLIENT FETCH", {
          slug: activeSlug,
          seoSlugExtracted: json?.context?.baseSlug || json?.part?.slug || null,
          hasSeo: !!json,
        });
      } catch (err) {
        console.error("SEO fetch error:", err);
        if (!cancelled) setSeoData(null);
      }
    }

    fetchSeo();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Popular Category Click Handler: always use startTransition logic (reset keyword/page)
  const handlePopularCategoryClick = useCallback((cat) => {
    const nextCategory = String(
      typeof cat === "string"
        ? cat
        : cat?.canonical_name ||
        cat?.category ||
        cat?.category_name ||
        cat?.name ||
        ""
    ).trim();

    if (!nextCategory) return;

    startTransition(() => {
      navigateToState({ category: nextCategory });
      setKeyword("");
      setPage(1);
    });
  }, [navigateToState, setKeyword, setPage]);

  // For SEO and fallback article: use current state for filters
  const finalArticle = useMemo(() => {
    if (finalSeoData) return finalSeoData;
    return {
      source: "dynamic",
      content: buildDynamicListingSeoContent({
        h1: pageTitle,
        products: [],
        filters: {
          brand,
          model,
          year,
          location,
        },
        knowledgeRows: [],
        tier,
      }),
    };
  }, [finalSeoData, pageTitle, brand, model, year, location, tier]);

  const listFetchAbortRef = useRef(null);
  const suggestAbortRef = useRef(null);
  const carBoxRef = useRef(null);
  const searchPanelRef = useRef(null);
  const searchPanelMobileRef = useRef(null);
  const ofSearchInputDesktopRef = useRef(null);
  const ofSearchInputMobileRef = useRef(null);
  const vehiclePanelWasOpenRef = useRef(false);
  const panelModelsFetchKeyRef = useRef("");
  const panelYearsFetchKeyRef = useRef("");
  const categoryItemRefs = useRef(new Map());

  // Reset all filters to base home state
  const applyBaseHome = useCallback(() => {
    startTransition(() => {
      setCategory("");
      setBrand("");
      setModel("");
      setYear("");
      setLocation("");
      router.replace("/", { scroll: false });
      setKeyword("");
      setPage(1);
    });
    setOpen(false);
    closeMobileVehiclePanel();
  }, [router, closeMobileVehiclePanel, setCategory, setBrand, setModel, setYear, setLocation, setKeyword, setPage]);

  // Vehicle Quick Select Handler (ALIGNED: sets brand/model/year/page, clears lower when upper changed)
  const applyVehicleQuickFilter = useCallback(
    (brandVal, modelVal) => {
      startTransition(() => {
        setSeoData(null);
        navigateToState({ category: "", brand: brandVal, model: modelVal || "", year: "" });
        setPage(1);
      });
    },
    [navigateToState, setPage],
  );

  // Save recent searches to localStorage
  const saveRecentSearch = useCallback((term) => {
    const t = (term || "").trim();
    if (!t) return;
    try {
      const prev = JSON.parse(
        localStorage.getItem(RECENT_SEARCHES_KEY) || "[]"
      );
      const arr = Array.isArray(prev) ? prev : [];
      const next = [t, ...arr.filter((x) => x !== t)].slice(0, 8);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      setRecentSearches(next);
    } catch {
      /* ignore */
    }
  }, []);

  // ALIGNED: submitCommittedSearch only sets state and resets, NO router or URL logic
  const submitCommittedSearch = useCallback(
    (explicitTerm) => {
      const raw =
        explicitTerm !== undefined && explicitTerm !== null
          ? String(explicitTerm)
          : searchInputValue;

      const t = raw.trim();

      if (t) saveRecentSearch(t);

      startTransition(() => {
        // 🔥 reset category (QUAN TRỌNG NHẤT)
        setCategory("");

        const slug = buildPathFromState({
          category: "", // giữ nguyên để URL đúng
          brand,
          model,
          year,
          location,
        });

        const params = new URLSearchParams();
        if (t) params.set("keyword", t);

        router.replace(`${slug}?${params.toString()}`, { scroll: false });

        // 🔥 trigger lại data fetch
        setKeyword(t);
        setPage(1);
      });

      setSuggestPanelOpen(false);
    },
    [searchInputValue, brand, model, year, location]
  );

  const clearSearchCommitted = useCallback(() => {
    startTransition(() => {
      setSearchInputValue("");
      setKeyword("");
      setPage(1);
    });
    setSuggestPanelOpen(false);
  }, [setKeyword, setPage]);

  // View product detail (navigate internally), using only state
  const handleQuickProductClick = useCallback(
    (row, fromMobileSearch) => {
      if (!row) return;
      setSuggestPanelOpen(false);
      if (fromMobileSearch) {
        setMobileMenu(false);
        closeMobileVehiclePanel();
      }
      // IN PRODUCTION: replace with page navigation logic, for now: window.location
      window.location.href = getProductDetailHref(row);
    },
    [closeMobileVehiclePanel],
  );

  const handleCategorySuggestionClick = useCallback(
    (item) => {
      startTransition(() => {
        navigateToState({ category: item.canonical_name });
        setKeyword("");
        setPage(1);
      });
    },
    [navigateToState, setKeyword, setPage],
  );

  // SEO chip brands/models (unchanged)
  const seoDisplayBrands = useMemo(() => {
    if (seoVehicleHot == null) {
      return mergeBrandNamesToLength([], FALLBACK_SEO_TOP_BRANDS, 10);
    }
    return seoVehicleHot.brandNames;
  }, [seoVehicleHot]);
  const seoDisplayModels = useMemo(() => {
    if (seoVehicleHot == null) {
      return mergeModelRowsToLength([], FALLBACK_SEO_HOT_MODELS, 20);
    }
    return seoVehicleHot.modelRows;
  }, [seoVehicleHot]);

  // Sync brands
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        console.log("PANEL FETCH BRANDS");
        const data = await fetchJsonCached(`${API_BASE}/filter/brands`, {
          ttlMs: 300_000,
        });
        if (cancelled) return;
        const sorted = [...getApiList(data)].sort(
          (a, b) => (b.total || 0) - (a.total || 0),
        );
        console.log("BRANDS LOADED", sorted);
        setBrands(sorted);
      } catch {
        if (!cancelled) setBrands([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/filter/vehicle-hot`);
        if (!res.ok) throw new Error("vehicle-hot");
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const rawBrands = Array.isArray(body?.brands) ? body.brands : [];
        const rawModels = Array.isArray(body?.models) ? body.models : [];
        const namesFromApi = rawBrands.map((b) => b?.name).filter(Boolean);
        const modelsFromApi = rawModels
          .map((r) => ({
            brand: r?.brand,
            model: r?.model,
          }))
          .filter((r) => r.brand && r.model);
        setSeoVehicleHot({
          brandNames: mergeBrandNamesToLength(
            namesFromApi,
            FALLBACK_SEO_TOP_BRANDS,
            10,
          ),
          modelRows: mergeModelRowsToLength(
            modelsFromApi,
            FALLBACK_SEO_HOT_MODELS,
            20,
          ),
        });
      } catch {
        if (!cancelled) {
          setSeoVehicleHot({
            brandNames: [...FALLBACK_SEO_TOP_BRANDS],
            modelRows: [...FALLBACK_SEO_HOT_MODELS],
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      const arr = JSON.parse(raw || "[]");
      if (Array.isArray(arr)) setRecentSearches(arr.filter(Boolean).slice(0, 8));
    } catch {
      setRecentSearches([]);
    }
  }, []);

  /* ===== VEHICLE PANEL DRAFT STATE HANDLING ===== */
  useEffect(() => {
    const isOpen = open || mobileFilter;

    if (!isOpen) {
      vehiclePanelWasOpenRef.current = false;
      return;
    }

    // Chỉ init đúng 1 lần khi panel mở lần đầu
    if (vehiclePanelWasOpenRef.current) {
      console.log("PANEL PRESERVE STATE", quickDraft);
      return;
    }

    vehiclePanelWasOpenRef.current = true;

    let b = brand || "";
    let m = model || "";
    let y = year != null ? String(year) : "";

    if (!b && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(QUICK_VEHICLE_STORAGE_KEY);
        const o = raw ? JSON.parse(raw) : null;

        if (o?.brand) {
          b = String(o.brand);
          m = o.model ? String(o.model) : "";
          y = o.year != null ? String(o.year) : "";
        }
      } catch {
        // ignore
      }
    }

    setQuickDraft({
      brand: b,
      model: m,
      year: y,
    });

    if (!b) setQuickStep(1);
    else if (!m) setQuickStep(2);
    else setQuickStep(3);

  }, [
    open,
    mobileFilter,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const b = String(quickDraft.brand || "").trim();
    if (!b) {
      try {
        localStorage.removeItem(QUICK_VEHICLE_STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }
    try {
      localStorage.setItem(
        QUICK_VEHICLE_STORAGE_KEY,
        JSON.stringify({
          brand: b,
          model: quickDraft.model ? String(quickDraft.model) : "",
          year: quickDraft.year != null ? String(quickDraft.year) : "",
        }),
      );
      console.log("PANEL PRESERVE STATE", quickDraft);
    } catch {
      // ignore
    }
  }, [quickDraft]);

  useEffect(() => {
    const isHomepage = pathname === "/";
    const hasVehicleFilter = Boolean(brand || model || year);
    if (!isHomepage || hasVehicleFilter) return;

    setQuickDraft({ brand: "", model: "", year: "" });
    setDraftModels([]);
    setDraftYears([]);
    setQuickStep(1);
    panelModelsFetchKeyRef.current = "";
    panelYearsFetchKeyRef.current = "";

    try {
      localStorage.removeItem(QUICK_VEHICLE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [pathname, brand, model, year]);

  useEffect(() => {
    if (!open && !mobileFilter) return;
    const b = String(quickDraft.brand || "").trim();
    if (!b) {
      panelModelsFetchKeyRef.current = "";
      setDraftModels([]);
      setDraftModelsLoading(false);
      return;
    }
    if (panelModelsFetchKeyRef.current === b) {
      console.log("PANEL PRESERVE STATE", { modelsForBrand: b });
      return;
    }
    panelModelsFetchKeyRef.current = b;
    let cancelled = false;
    setDraftModelsLoading(true);
    console.log("PANEL FETCH MODELS", b);
    fetchJsonCached(
      `${API_BASE}/filter/models?brand=${encodeURIComponent(b)}`,
      { ttlMs: 120_000 },
    )
      .then((data) => {
        if (cancelled) return;
        const sorted = [...getApiList(data)].sort(
          (a, b) => (b.total || 0) - (a.total || 0),
        );
        console.log("MODELS LOADED", sorted);
        setDraftModels(sorted);
      })
      .catch(() => {
        if (!cancelled) setDraftModels([]);
      })
      .finally(() => {
        if (!cancelled) setDraftModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mobileFilter, quickDraft.brand]);

  useEffect(() => {
    if (!open && !mobileFilter) return;
    const b = String(quickDraft.brand || "").trim();
    const m = String(quickDraft.model || "").trim();
    if (!b || !m) {
      panelYearsFetchKeyRef.current = "";
      setDraftYears([]);
      setDraftYearsLoading(false);
      return;
    }
    const fetchKey = `${b}::${m}`;
    if (panelYearsFetchKeyRef.current === fetchKey) {
      console.log("PANEL PRESERVE STATE", { yearsForBrand: b, yearsForModel: m });
      return;
    }
    panelYearsFetchKeyRef.current = fetchKey;
    let cancelled = false;
    setDraftYearsLoading(true);
    const yUrl = `${API_BASE}/filter/years?brand=${encodeURIComponent(b)}&model=${encodeURIComponent(m)}`;
    console.log("PANEL FETCH YEARS", { brand: b, model: m });
    fetchJsonCached(yUrl, { ttlMs: 120_000 })
      .then((data) => {
        if (cancelled) return;
        const list = getApiList(data);
        console.log("YEARS LOADED", list);
        setDraftYears(list);
      })
      .catch(() => {
        if (!cancelled) setDraftYears([]);
      })
      .finally(() => {
        if (!cancelled) setDraftYearsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    mobileFilter,
    quickDraft.brand,
    quickDraft.model,
  ]);

  /* FILTERED MODELS */
  useEffect(() => {
    if (!brand) {
      setModels([]);
      return;
    }
    const modelsUrl = `${API_BASE}/filter/models?brand=${encodeURIComponent(
      brand,
    )}`;
    fetchJsonCached(modelsUrl, { ttlMs: 120_000 })
      .then((data) => {
        const sorted = [...getApiList(data)].sort(
          (a, b) => (b.total || 0) - (a.total || 0),
        );
        console.log("MODELS LOADED", sorted);
        setModels(sorted);
      })
      .catch(() => setModels([]));
  }, [brand]);

  useEffect(() => {
    if (!brand || !model) {
      setYears([]);
      setSpecs({
        engine: [],
        gearbox: [],
        drivetrain: [],
        bodyType: [],
        cc: [],
      });
      return;
    }

    const yUrl = `${API_BASE}/filter/years?brand=${encodeURIComponent(
      brand,
    )}&model=${encodeURIComponent(model)}`;
    const sUrl = `${API_BASE}/filter/specs?brand=${encodeURIComponent(
      brand,
    )}&model=${encodeURIComponent(model)}`;

    fetchJsonCached(yUrl, { ttlMs: 120_000 })
      .then((data) => {
        const list = getApiList(data);
        console.log("YEARS LOADED", list);
        setYears(list);
      })
      .catch(() => setYears([]));

    fetchJsonCached(sUrl, { ttlMs: 120_000 })
      .then(setSpecs)
      .catch(() =>
        setSpecs({
          engine: [],
          gearbox: [],
          drivetrain: [],
          bodyType: [],
          cc: [],
        }),
      );
  }, [brand, model]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (brand) params.append("brand", brand);
    if (model) params.append("model", model);
    if (year) params.append("year", year);
    if (location) params.append("location", location);
    if (keyword) params.append("keyword", keyword);

    let cancelled = false;
    (async () => {
      try {
        let url = `${API_BASE}/product-categories/canonical?${params.toString()}`;
        let data = await fetchJsonCached(url, { ttlMs: 120_000 });

        if (Array.isArray(data) && data.length > 0) {
          data = data.sort((a, b) => (b.total_product_count || 0) - (a.total_product_count || 0));
        }

        if (!data || !Array.isArray(data) || data.length === 0) {
          url = `${API_BASE}/product-categories?${params.toString()}`;
          data = await fetchJsonCached(url, { ttlMs: 120_000 });
        }

        if (!data || !Array.isArray(data) || data.length === 0) {
          url = `${API_BASE}/filter/categories?${params.toString()}`;
          data = await fetchJsonCached(url, { ttlMs: 120_000 });
        }

        if (!cancelled) {
          setCategories(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brand, model, year, location, keyword]);

  // Locations (filtered by filters)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const endpoint = `${API_BASE}/products/locations`;
        const params = new URLSearchParams();
        console.log("LOCATION FILTER:", {
          category,
          brand,
          model,
          year,
          keyword,
        });
        if (category) params.append("category", category);
        if (brand) params.append("brand", brand);
        if (model) params.append("model", model);
        if (year) params.append("year", year);
        if (keyword) params.append("keyword", keyword);
        const url = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
        const data = await fetchJsonCached(url, { ttlMs: 60_000 });
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setAvailableLocations(list);
        if (selectedCity && selectedCity.id === 0 && list.length > 0) {
          const cleanName = selectedCity.name.replace(/^TP\s+/i, "").trim().toLowerCase();
          const match = list.find((loc) => {
            const locClean = loc.name.replace(/^TP\s+/i, "").trim().toLowerCase();
            return locClean === cleanName || loc.slug === cleanName.replace(/\s+/g, "-");
          });
          if (match) {
            setSelectedCity({ id: match.id, name: match.name, slug: match.slug });
          }
        }
      } catch {
        if (!cancelled) setAvailableLocations([]);
      }
    })();
    return () => { cancelled = true; };
  }, [category, brand, model, year, keyword]);

  // Whenever selectedCity changes, update STATE location (step 5: city select = setLocation + setPage)
  useEffect(() => {
    const rawName = selectedCity?.name || "";
    const cityName = rawName.replace(/^TP\s+/i, "").trim();
    if (location !== cityName && rawName) {
      startTransition(() => {
        navigateToState({ location: cityName });
        setPage(1);
      });
    }
  }, [selectedCity, location, navigateToState, setPage]);

  // 🔥 SYNC NGƯỢC: location -> selectedCity
  useEffect(() => {
    if (!location || !availableLocations.length) {
      setSelectedCity(null);
      return;
    }

    const clean = location.toLowerCase();

    const match = availableLocations.find((loc) => {
      const name = loc.name.replace(/^TP\s+/i, "").trim().toLowerCase();
      return name === clean;
    });

    if (match) {
      setSelectedCity({
        id: match.id,
        name: match.name,
        slug: match.slug,
      });
    }
  }, [location, availableLocations]);

  // PAGINATION: keep page in range
  useEffect(() => {
    if (totalPages < 1) return;
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page, setPage]);

  // CUỘN sản phẩm khi đổi filters
  const scrollProductsIntoView = useCallback(() => {
    setTimeout(() => {
      productListAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 30);
  }, []);

  useEffect(() => {
    if (skipProductScrollRef.current) {
      skipProductScrollRef.current = false;
      return;
    }
    scrollProductsIntoView();
  }, [listingState.stateKey, scrollProductsIntoView]);

  // FETCH PRODUCT LIST: strictly depend only on state
  useEffect(() => {
    if (listFetchAbortRef.current) {
      listFetchAbortRef.current.abort();
    }
    const ac = new AbortController();
    listFetchAbortRef.current = ac;
    let cancelled = false;

    (async () => {
      setListError("");
      setListBootstrapping(true);
      try {
        console.log("FILTER STATE → FETCH", {
          brand,
          model,
          year,
          location,
        });
        console.log("PRODUCT LIST FETCH", {
          category,
          brand,
          model,
          year,
          location,
          keyword,
          page,
          sort,
        });
        console.log("FILTER CASE:", {
          category,
          location,
          brand,
          model,
          year,
          hasVehicle: Boolean(brand || model || year),
          hasCategory: Boolean(category),
          hasLocation: Boolean(location),
        });
        // Build query from STATE, not from slugs
        const params = new URLSearchParams();
        const query = {};
        const c = cleanQueryValue(category);
        const b = cleanQueryValue(brand);
        const m = cleanQueryValue(model);
        const y = cleanQueryValue(year);
        const l = cleanQueryValue(location);
        const k = cleanQueryValue(keyword);
        const p = cleanQueryValue(page);
        const s = cleanQueryValue(sort) || "popular";
        if (c) query.category = c;
        if (b) query.brand = b;
        if (m) query.model = m;
        if (y) query.year = y;
        if (l) query.location = l;
        if (k) query.keyword = k;
        if (p) query.page = String(p);
        if (s) query.sort = s;
        console.log("FINAL FILTER QUERY:", query);
        Object.entries(query).forEach(([key, value]) => {
          params.append(key, String(value));
        });

        const url = `${API_BASE}/products?${params.toString()}`;
        const res = await fetch(url, { signal: ac.signal });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(body?.message || `HTTP ${res.status}`);
        }

        if (cancelled) return;
        if (listFetchAbortRef.current === ac) listFetchAbortRef.current = null;
        setProducts(Array.isArray(body?.data) ? body.data : []);
        const tp = Number(body?.totalPages);
        setTotalPages(Number.isFinite(tp) && tp >= 1 ? tp : 1);
      } catch (e) {
        if (e?.name === "AbortError" || e?.code === 20) return;
        if (cancelled) return;
        setListError(
          "Không tải được danh sách sản phẩm. Hãy chạy backend (npm start trong thư mục backend) và tải lại trang. Nếu API không ở cổng 5000, chỉnh API_INTERNAL_ORIGIN trong frontend hoặc đặt NEXT_PUBLIC_API_BASE_URL.",
        );
        setProducts([]);
        setTotalPages(1);
      } finally {
        if (cancelled) return;
        if (ac.signal.aborted) return;
        setListBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
      if (listFetchAbortRef.current) {
        listFetchAbortRef.current.abort();
        listFetchAbortRef.current = null;
      }
    };
  }, [category, brand, model, year, location, keyword, page, sort]);

  // City dropdown outside click
  useEffect(() => {
    if (!cityDropdownOpen) return;
    const handler = (e) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target)) {
        setCityDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [cityDropdownOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = "Otofine";
    document.title =
      pageTitle === "Phụ tùng ô tô chính hãng giá tốt"
        ? `${base} — Phụ tùng ô tô đúng xe, minh bạch giá`
        : `${pageTitle} | ${base}`;
  }, [pageTitle]);

  // SUPPORT: fetch search recommends & categories (unchanged logic)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const q = searchInputValue.trim();
      if (q.length < 2) {
        if (suggestAbortRef.current) {
          suggestAbortRef.current.abort();
          suggestAbortRef.current = null;
        }
        if (!cancelled) {
          setSuggestItems([]);
          setCategorySuggestions([]);
          setSuggestLoading(false);
        }
        return;
      }
      if (suggestAbortRef.current) {
        suggestAbortRef.current.abort();
      }
      const ac = new AbortController();
      suggestAbortRef.current = ac;
      setSuggestLoading(true);
      try {
        // Fetch product suggestions
        const p = new URLSearchParams();
        p.append("q", q);
        p.append("page", "1");
        p.append("limit", "100");
        if (brand) p.append("brand", brand);
        if (model) p.append("model", model);
        if (year) p.append("year", year);
        const res = await fetch(`${API_BASE}/products/search?${p.toString()}`, {
          signal: ac.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (suggestAbortRef.current === ac) suggestAbortRef.current = null;
        setSuggestItems(Array.isArray(body?.data) ? body.data : []);

        // Fetch category suggestions in parallel
        const catParams = new URLSearchParams();
        catParams.append("q", q);
        if (brand) catParams.append("brand", brand);
        if (model) catParams.append("model", model);
        if (year) catParams.append("year", year);
        const catRes = await fetch(`${API_BASE}/product-categories/search-sidebar?${catParams.toString()}`, {
          signal: ac.signal,
        });
        const catBody = await catRes.json().catch(() => ([]));
        if (cancelled) return;
        setCategorySuggestions(Array.isArray(catBody) ? catBody : []);
      } catch (e) {
        if (e?.name === "AbortError" || e?.code === 20) return;
        if (!cancelled) {
          setSuggestItems([]);
          setCategorySuggestions([]);
        }
      } finally {
        if (cancelled) return;
        if (ac?.signal?.aborted) return;
        setSuggestLoading(false);
      }
    }, SUGGEST_FETCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchInputValue, brand, model, year]);

  // POPULAR + RECENT
  const popularQuickKeywords = useMemo(() => {
    const fixedFour = HOT_KEYWORDS.slice(0, 4);
    const seen = new Set(fixedFour);
    const fromRecent = [];
    for (const raw of recentSearches) {
      const t = (raw || "").trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      fromRecent.push(t);
      if (fromRecent.length >= 4) break;
    }
    return [...fixedFour, ...fromRecent];
  }, [recentSearches]);

  const clearRecentSearches = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch { }
    setRecentSearches([]);
  }, []);

  useEffect(() => {
    if (searchInputValue.trim()) {
      setLeftPopularOpen(false);
      setLeftRecentOpen(false);
    }
  }, [searchInputValue]);

  // Categories (filtered in list) — rely on backend filtering only
  const filteredCategories = useMemo(() => categories, [categories]);
  const menuCategories = categories;

  const popularCategories = useMemo(() => {
    return [...menuCategories]
      .sort((a, b) => (b.total_product_count || 0) - (a.total_product_count || 0))
      .slice(0, 20);
  }, [menuCategories]);

  useEffect(() => {
    console.log("CATEGORIES:", categories.length);
    console.log("POPULAR:", popularCategories.length);
  }, [categories, popularCategories]);

  useEffect(() => {
    console.log("MENU COUNT:", menuCategories.length);
    console.log("POPULAR COUNT:", popularCategories.length);
  }, [menuCategories, popularCategories]);

  // VEHICLE PANEL LOGIC
  const goToAdvancedFromQuick = useCallback(() => {
    setQuickStep(1);
  }, []);

  const applyQuickVehicle = useCallback(() => {
    startTransition(() => {
      navigateToState({
        category: "",
        location,

        brand: quickDraft.brand || "",
        model: quickDraft.model || "",
        year: quickDraft.year || "",

        page: 1,
      });
      setSeoData(null);
      setPage(1);
    });

    scrollProductsIntoView();
  }, [quickDraft, location, navigateToState, setPage, scrollProductsIntoView]);

  const persistQuickVehicleDraft = useCallback((draft) => {
    if (typeof window === "undefined") return;
    const b = String(draft?.brand || "").trim();
    try {
      if (!b) {
        localStorage.removeItem(QUICK_VEHICLE_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        QUICK_VEHICLE_STORAGE_KEY,
        JSON.stringify({
          brand: b,
          model: draft.model ? String(draft.model) : "",
          year: draft.year != null ? String(draft.year) : "",
        }),
      );
    } catch {
      // ignore
    }
  }, []);

  const resetQuickVehicle = useCallback((opts = {}) => {
    const keepMobileDrawer = Boolean(opts.keepMobileDrawer);
    if (keepMobileDrawer) {
      try {
        sessionStorage.setItem(MOBILE_VEHICLE_PANEL_OPEN_KEY, "1");
      } catch {
        // ignore
      }
      setMobileFilter(true);
    }

    setQuickDraft({ brand: "", model: "", year: "" });
    setDraftModels([]);
    setDraftYears([]);
    setQuickStep(1);
    panelModelsFetchKeyRef.current = "";
    panelYearsFetchKeyRef.current = "";

    try {
      localStorage.removeItem(QUICK_VEHICLE_STORAGE_KEY);
    } catch {
      // ignore
    }

    startTransition(() => {
      navigateToState({ category: "", brand: "", model: "", year: "" });
      setKeyword("");
      setPage(1);
    });

    setModels([]);
  }, [navigateToState, setKeyword, setPage]);

  // HANDLERS for quick panel steps
  const handleQuickPickBrand = useCallback((name) => {
    const nextDraft = {
      brand: name,
      model: "",
      year: "",
    };

    setQuickDraft(nextDraft);
    persistQuickVehicleDraft(nextDraft);
    setQuickStep(2);

    startTransition(() => {
      navigateToState(
        {
          category: "",
          brand: name,
          model: "",
          year: "",
        }
      );
      setPage(1);
    });
  }, [navigateToState, persistQuickVehicleDraft, setPage]);
  const handleQuickPickModel = useCallback((name) => {
    const currentBrand = quickDraft.brand || brand;

    const nextDraft = {
      brand: currentBrand,
      model: name,
      year: "",
    };

    setQuickDraft(nextDraft);
    persistQuickVehicleDraft(nextDraft);
    setQuickStep(3);

    startTransition(() => {
      navigateToState(
        {
          category: "",
          brand: currentBrand,
          model: name,
          year: "",
        }
      );
      setPage(1);
    });
  }, [quickDraft.brand, brand, navigateToState, persistQuickVehicleDraft, setPage]);
  const handleQuickPickYear = useCallback((y) => {
    const currentBrand =
      quickDraft.brand || brand || "";

    const currentModel =
      quickDraft.model || model || "";

    const nextDraft = {
      brand: currentBrand,
      model: currentModel,
      year: y,
    };

    setQuickDraft(nextDraft);
    persistQuickVehicleDraft(nextDraft);
    setQuickStep(3);

    startTransition(() => {
      navigateToState({
        category: "",
        brand: currentBrand,
        model: currentModel,
        year: y,
      });

      setPage(1);
    });
  }, [
    quickDraft.brand,
    quickDraft.model,
    brand,
    model,
    navigateToState,
    persistQuickVehicleDraft,
    setPage,
  ]);
  const handleQuickClearYear = useCallback(() => {
    setQuickDraft((d) => ({ ...d, year: "" }));
  }, []);
  const handleQuickBreadcrumb = useCallback((step) => {

    if (step === 1) {

      setQuickDraft({
        brand: "",
        model: "",
        year: "",
      });
      persistQuickVehicleDraft({ brand: "", model: "", year: "" });

      setQuickStep(1);

      startTransition(() => {
        navigateToState({
          category: "",
          brand: "",
          model: "",
          year: "",
        });

        setPage(1);
      });

      return;
    }

    if (step === 2) {

      const currentBrand =
        quickDraft.brand || brand || "";

      setQuickDraft({
        brand: currentBrand,
        model: "",
        year: "",
      });
      persistQuickVehicleDraft({
        brand: currentBrand,
        model: "",
        year: "",
      });

      setQuickStep(2);

      startTransition(() => {
        navigateToState({
          category: "",
          brand: currentBrand,
          model: "",
          year: "",
        });

        setPage(1);
      });
    }

  }, [
    quickDraft.brand,
    brand,
    navigateToState,
    persistQuickVehicleDraft,
    setPage,
  ]);

  // SEARCH PANEL/CATEGORY PANEL/LEFT QUICK
  const renderVehiclePanelBody = () => (
    <VehicleQuickPanel
      quickStep={quickStep}
      quickDraft={quickDraft}
      brand={brand}
      model={model}
      year={year}
      onPickBrand={handleQuickPickBrand}
      onPickModel={handleQuickPickModel}
      onPickYear={handleQuickPickYear}
      onClearYear={handleQuickClearYear}
      onBreadcrumbToStep={handleQuickBreadcrumb}
      brands={brands}
      draftModels={draftModels}
      draftYears={draftYears}
      modelsLoading={draftModelsLoading}
      yearsLoading={draftYearsLoading}
      onAdvanced={goToAdvancedFromQuick}
      onApply={applyQuickVehicle}
      onReset={
        mobileFilter
          ? () => resetQuickVehicle({ keepMobileDrawer: true })
          : resetQuickVehicle
      }
    />
  );

  // SEARCH PANEL ONLY (searchInputValue, suggestItems, categorySuggestions)
  const renderSearchPanelOnly = (isMobile) => {
    const searchAssistId = `otofine-search-suggest${isMobile ? "-m" : ""}`;
    const hasSearchKeyword = searchInputValue.trim().length > 0;
    const hasQuickSuggest =
      suggestPanelOpen &&
      hasSearchKeyword &&
      Array.isArray(suggestItems) &&
      suggestItems.length > 0;
    const hasCategoryFill =
      suggestPanelOpen && hasSearchKeyword && !hasQuickSuggest;
    const searchPanelRefLocal = isMobile
      ? searchPanelMobileRef
      : searchPanelRef;
    const inputRef = isMobile ? ofSearchInputMobileRef : ofSearchInputDesktopRef;

    return (
      <div
        ref={searchPanelRefLocal}
        className={
          isMobile
            ? "of-header-search of-header-search--mobile"
            : "of-header-search of-side-search of-header-search--desktop"
        }
      >
        <div className="search-panel-wrap">
          <p className="of-side-label">Tìm phụ tùng</p>
          <div className="search-combo search-sidebar-combo">
            <div className="category-search-wrap">
              <div className="search-inline-wrap">
                <input
                  ref={inputRef}
                  type="text"
                  enterKeyHint="search"
                  placeholder="Tìm lọc dầu Vios, má phanh Camry, đèn Mazda 3…"
                  className="category-search"
                  value={searchInputValue}
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-label="Tìm phụ tùng ô tô"
                  aria-expanded={suggestPanelOpen}
                  aria-controls={
                    suggestPanelOpen
                      ? hasQuickSuggest || hasCategoryFill
                        ? searchAssistId
                        : undefined
                      : undefined
                  }
                  onFocus={() => {
                    setSuggestPanelOpen(true);
                  }}
                  onChange={(e) => {
                    setSearchInputValue(e.target.value);
                    setSuggestPanelOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitCommittedSearch();
                      if (isMobile) {
                        setMobileMenu(false);
                        closeMobileVehiclePanel();
                      }
                    }
                    if (e.key === "Escape") setSuggestPanelOpen(false);
                  }}
                />

                <span className="measure-text" ref={textMeasureRef}>
                  {searchInputValue}
                </span>

                <button
                  type="button"
                  className="clear-inline"
                  onClick={clearSearchCommitted}
                  aria-label="Xóa tìm kiếm"
                >
                  ✕
                </button>

                <span
                  className="category-icon"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    submitCommittedSearch();
                    if (isMobile) {
                      setMobileMenu(false);
                      closeMobileVehiclePanel();
                    }
                  }}
                >
                  🔍
                </span>
              </div>
            </div>

            {hasQuickSuggest && (
              <SearchSuggestPanel
                isMobile={isMobile}
                searchAssistId={searchAssistId}
                suggestItems={suggestItems}
                onProductClick={handleQuickProductClick}
                categorySuggestions={categorySuggestions}
                onCategoryClick={handleCategorySuggestionClick}
              />
            )}

            {/* {hasCategoryFill && (
              <div
                id={searchAssistId}
                className="search-suggest-wrap search-suggest-wrap--cats-only"
                role="listbox"
                aria-label="Danh mục gợi ý"
              >
                <div className="search-suggest-split__sub">DANH MỤC LIÊN QUAN</div>
                <ul className="search-suggest-cat-list search-suggest-cat-list--solo">
                  {categorySuggestions.length === 0 ? (
                    <li className="search-suggest-category-empty">
                      Không tìm thấy nhóm danh mục phù hợp.
                    </li>
                  ) : (
                    categorySuggestions.map((item) => (
                      <li key={item.canonical_slug}>
                        <button
                          onClick={() => {
                            startTransition(() => {
                              navigateToState({ category: item.canonical_name });
                              setKeyword("");
                              setPage(1);
                            });
                          }}
                          className="search-suggest-cat-pill"
                        >
                          <span>{item.canonical_name}</span>
                          {item.total_count && (
                            <span className="search-suggest-cat-count">({item.total_count})</span>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )} */}
          </div>
        </div>
      </div>
    );
  };

  const renderCategoryPanel = (isMobile = false) => {
    const searchAssistId = `otofine-search-suggest${isMobile ? "-m" : ""}`;
    const hasSearchKeyword = searchInputValue.trim().length > 0;
    const hasQuickSuggest =
      suggestPanelOpen &&
      hasSearchKeyword &&
      Array.isArray(suggestItems) &&
      suggestItems.length > 0;
    const categoryAssistiveId =
      suggestPanelOpen && hasSearchKeyword && !hasQuickSuggest
        ? searchAssistId
        : undefined;

    // For mobile menu without search, limit to first 15 categories
    const displayCategories = isMobile && !hasSearchKeyword
      ? filteredCategories.slice(0, 15)
      : filteredCategories;

    // Show categorySuggestions when searching
    const showCategorySuggestions = hasSearchKeyword && categorySuggestions.length > 0;

    return (
      <div
        className="category-box sidebar-category-box of-category-compact"
      >
        {!isMobile && (
          <h2 className="of-sidebar-cat-heading">Danh mục phụ tùng</h2>
        )}

        <div className="sidebar-category-body">
          <ul
            className="category category-scroll"
            id={categoryAssistiveId}
            role="listbox"
            aria-label="Danh mục"
          >
            {showCategorySuggestions ? (
              categorySuggestions.map((item) => (
                <li
                  key={item.canonical_slug}
                  ref={(el) => {
                    const k = `${isMobile ? "m" : "d"}-${item.canonical_name}`;
                    if (el) categoryItemRefs.current.set(k, el);
                    else categoryItemRefs.current.delete(k);
                  }}
                >
                  <button
                    onClick={() => {
                      startTransition(() => {
                        navigateToState({ category: item.canonical_name });
                        setKeyword("");
                        setPage(1);
                      });
                    }}
                    className="category-link"
                  >
                    <span className="category-name">{item.canonical_name}</span>
                    {item.total_count && (
                      <span className="category-count">({item.total_count})</span>
                    )}
                  </button>
                </li>
              ))
            ) : (
              displayCategories.map((item, index) => (
                <li
                  key={`${item.id || item.canonical_slug || item.category_slug || item.slug || item.canonical_name || "cat"}-${index}`}
                  ref={(el) => {
                    const k = `${isMobile ? "m" : "d"}-${item.canonical_name || item.category_name || item.name}`;
                    if (el) categoryItemRefs.current.set(k, el);
                    else categoryItemRefs.current.delete(k);
                  }}
                >
                  <button
                    onClick={() => {
                      startTransition(() => {
                        navigateToState({
                          category: item.canonical_name || item.category_name || item.name,
                        });
                        setKeyword("");
                        setPage(1);
                      });
                    }}
                    className="category-link"
                  >
                    <span className="category-name">{item.canonical_name || item.category_name || item.name}</span>
                    {item.total_count && (
                      <span className="category-count">({item.total_count})</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    );
  };

  const renderLeftQuickBlocks = (forMobileDrawer = false) => (
    <div
      className={
        forMobileDrawer
          ? "of-left-quick of-left-quick--drawer"
          : "of-left-quick"
      }
    >
      <div className="of-side-fold">
        <button
          type="button"
          className="of-side-fold__btn"
          onClick={() => setLeftPopularOpen((v) => !v)}
          aria-expanded={leftPopularOpen}
        >
          Tìm nhanh phổ biến
          <span className="of-side-fold__chev" aria-hidden>
            {leftPopularOpen ? "▾" : "▸"}
          </span>
        </button>
        {leftPopularOpen && (
          <div className="of-side-fold__panel">
            <div className="search-chip-row search-chip-row--side">
              {popularQuickKeywords.map((kw) => (
                <button
                  key={kw}
                  type="button"
                  className={`search-chip search-chip--quick-popular ${SEARCH_POPULAR_ANCHORS.has(kw) ? "search-chip--quick-anchor" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    submitCommittedSearch(kw);
                    if (forMobileDrawer) setMobileMenu(false);
                    setLeftPopularOpen(false);
                    setLeftRecentOpen(false);
                  }}
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {recentSearches.length > 0 && (
        <div className="of-side-fold">
          <button
            type="button"
            className="of-side-fold__btn"
            onClick={() => setLeftRecentOpen((v) => !v)}
            aria-expanded={leftRecentOpen}
          >
            Tìm gần đây
            <span className="of-side-fold__chev" aria-hidden>
              {leftRecentOpen ? "▾" : "▸"}
            </span>
          </button>
          {leftRecentOpen && (
            <div className="of-side-fold__panel">
              <div className="of-recent-row">
                <span className="of-recent-hint">Lịch sử</span>
                <button
                  type="button"
                  className="search-panel-clear-history"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearRecentSearches();
                  }}
                >
                  Xóa
                </button>
              </div>
              <div className="search-chip-row search-chip-row--side">
                {recentSearches.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="search-chip search-chip--quick-recent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      submitCommittedSearch(t);
                      if (forMobileDrawer) setMobileMenu(false);
                      setLeftPopularOpen(false);
                      setLeftRecentOpen(false);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Search focus, menu/vehicle panel toggles, etc. — unchanged
  const focusHomeSearch = useCallback(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(max-width: 768px)").matches;
    (m ? ofSearchInputMobileRef : ofSearchInputDesktopRef).current?.focus();
  }, []);

  const homeSearchProps = {
    searchInputValue,
    suggestPanelOpen,
    suggestItems,
    categorySuggestions,
    filteredCategories,
    popularQuickKeywords,
    recentSearches,
    leftPopularOpen,
    leftRecentOpen,
    SEARCH_POPULAR_ANCHORS,
    textMeasureRef,
    categoryItemRefs,
    setSuggestPanelOpen,
    setSearchInputValue,
    setMobileMenu,
    setMobileFilter,
    setLeftPopularOpen,
    setLeftRecentOpen,
    submitCommittedSearch,
    clearSearchCommitted,
    handleQuickProductClick,
    navigateToState,
    setKeyword,
    setPage,
    clearRecentSearches,
  };

  return (
    <div className="of-home-root">
      <HomeHeader
        onOpenFilter={setMobileFilter}
        onOpenMenu={setMobileMenu}
        searchDesktop={
          <HomeSearch
            isMobile={false}
            searchPanelRef={searchPanelRef}
            inputRef={ofSearchInputDesktopRef}
            {...homeSearchProps}
          />
        }
        searchMobile={
          <HomeSearch
            isMobile={true}
            pageTitle={pageTitle}
            searchPanelRef={searchPanelMobileRef}
            inputRef={ofSearchInputMobileRef}
            {...homeSearchProps}
          />
        }
      />
      <div className="page of-home-page">
        <main className="of-home-main" id="otofine-main" lang="vi">
          <div className="home">
            {/* CONTENT */}
            <div className="container of-home-container">
              {/* LEFT */}
              <LeftNav
                carBoxRef={carBoxRef}
                open={open}
                renderVehiclePanelBody={renderVehiclePanelBody}
                goToAdvancedFromQuick={goToAdvancedFromQuick}
                quickDraft={quickDraft}
                seoDisplayModels={seoDisplayModels}
                applyVehicleQuickFilter={applyVehicleQuickFilter}
                popularCategories={popularCategories}
                selectedCategory={category}
                onPopularCategoryClick={handlePopularCategoryClick}
              />
              <div className="content-right of-home-content">
                <ListingHero pageTitle={pageTitle} />
                {listError ? (
                  <div className="list-error-banner">
                    {listError}{" "}
                    <span>(API: {API_BASE})</span>
                  </div>
                ) : null}
                <div
                  ref={productListAnchorRef}
                  id="otofine-products-start"
                  className="product-list-scroll-anchor"
                  aria-hidden
                />
                <div className="content-grid of-three-col">
                  <div className="content-grid-primary">

                    <FilterBar
                      sort={sort}
                      setSort={setSort}
                      startTransition={startTransition}
                      setPage={setPage}
                      cityDropdownRef={cityDropdownRef}
                      selectedCity={selectedCity}
                      setCityDropdownOpen={setCityDropdownOpen}
                      cityDropdownOpen={cityDropdownOpen}
                      availableLocations={availableLocations}
                      navigateToState={navigateToState}
                      setSelectedCity={setSelectedCity}
                    />


                    <ProductGridWrapper
                      keyword={keyword}
                      listError={listError}
                      listBootstrapping={listBootstrapping}
                      products={products}
                      totalPages={totalPages}
                      page={page}
                      setPage={setPage}
                      startTransition={startTransition}
                      navigateToState={navigateToState}
                      setKeyword={setKeyword}
                      scrollProductsIntoView={scrollProductsIntoView}
                      setContactPhone={setContactPhone}
                    />
                  </div>
                  <aside
                    className="of-right-rail"
                    aria-label="Hỗ trợ mua hàng &amp; lọc nhanh"
                  >
                    <div className="box box-trust sidebar-trust-card of-rail-card">
                      <h4 className="sidebar-trust-title">Mua hàng an tâm</h4>
                      <ul className="sidebar-trust-list">
                        <li>✓ Shop xác minh Otofine</li>
                        <li>✓ Liên hệ trực tiếp cửa hàng</li>
                        <li>✓ Giá minh bạch</li>
                        <li>✓ Hỗ trợ tìm đúng phụ tùng</li>
                      </ul>
                      <Link
                        href="/shop/register"
                        className="sidebar-cta sidebar-cta--register" prefetch={false}>
                        Đăng ký cửa hàng ngay
                      </Link>
                    </div>

                    <div className="of-request-card of-rail-card">
                      <h4 className="of-request-title">Báo giá phụ tùng</h4>
                      <p className="of-request-subtitle">Gửi yêu cầu — nhiều shop báo giá nhanh</p>
                      <div className="of-request-form">
                        <input
                          type="text"
                          className="of-request-input"
                          placeholder="VD: Má phanh Camry 2020, hoặc số khung"
                        />
                        <button type="button" className="of-request-upload-mini">
                          📷 Đính kèm ảnh phụ tùng / đăng kiểm
                        </button>
                        <button type="button" className="of-request-submit">
                          Gửi yêu cầu báo giá
                        </button>
                      </div>
                      <ul className="of-request-trust">
                        <li>✓ Nhiều shop nhận yêu cầu</li>
                        <li>✓ Shop phản hồi báo giá ngay</li>
                        <li>✓ Hỗ trợ tìm đúng phụ tùng</li>
                      </ul>
                    </div>

                    <div className="of-maintenance-card of-rail-card">
                      <h4 className="of-maintenance-title">Bảo dưỡng định kỳ</h4>
                      <p className="of-maintenance-desc">
                        Chọn mốc km để xem phụ tùng cần thay
                      </p>
                      <div className="of-maintenance-grid">
                        <button type="button" className="of-maintenance-chip">5.000 km</button>
                        <button type="button" className="of-maintenance-chip">10.000 km</button>
                        <button type="button" className="of-maintenance-chip">20.000 km</button>
                        <button type="button" className="of-maintenance-chip">40.000 km</button>
                        <button type="button" className="of-maintenance-chip">80.000 km</button>
                      </div>
                    </div>

                  </aside>
                </div>
                {finalSeoData && (
                  <SeoContent data={finalSeoData} slug={seoArticleSlug} imageProducts={products} />
                )}
                <section
                  className="of-trust-market"
                  aria-labelledby="of-trust-market-h2"
                >
                  <h2 id="of-trust-market-h2" className="of-trust-market__title">
                    Tại sao chọn Otofine
                  </h2>
                  <ul className="of-trust-market__grid" role="list">
                    {[
                      {
                        t: "✓ Shop đã xác minh",
                        d: "Thông tin shop rõ ràng hơn",
                      },
                      {
                        t: "✓ Hỗ trợ tìm đúng xe",
                        d: "Lọc theo hãng, dòng, năm",
                      },
                      {
                        t: "✓ Nhiều lựa chọn giá",
                        d: "So sánh nhiều shop nhanh",
                      },
                      {
                        t: "✓ Hỗ trợ tìm phụ tùng",
                        d: "Có thể gửi VIN hoặc ảnh",
                      },
                    ].map((x) => (
                      <li key={x.t} className="of-trust-market__item" role="listitem">
                        <h3 className="of-trust-market__h3">{x.t}</h3>
                        <p className="of-trust-market__p">{x.d}</p>
                      </li>
                    ))}
                  </ul>
                </section>
                <div className="site-info">
                  <h2>Về Otofine</h2>
                  <p>
                    Otofine là nền tảng kết nối người mua với các cửa hàng phụ
                    tùng ô tô trên toàn quốc. Website giúp khách hàng dễ dàng tìm
                    kiếm phụ tùng đúng dòng xe, đúng đời xe và so sánh nhiều mức
                    giá từ nhiều nhà bán khác nhau.
                  </p>
                  <p>
                    Danh mục sản phẩm bao gồm phụ tùng bảo dưỡng, phụ tùng gầm
                    máy, hệ thống điện, thân vỏ, đèn xe, gương xe, cảm biến, điều
                    hòa, dầu nhớt và nhiều linh kiện ô tô khác.
                  </p>
                  <p>
                    Otofine hướng tới trải nghiệm mua phụ tùng minh bạch, nhanh
                    chóng, tiết kiệm thời gian tìm kiếm và hỗ trợ người dùng lựa
                    chọn sản phẩm phù hợp nhu cầu sửa chữa, thay thế hoặc nâng cấp
                    xe.
                  </p>
                  <div className="site-links">
                    <Link href="/" prefetch={false}>Trang chủ</Link>
                    <button
                      type="button"
                      className="site-links-btn"
                      onClick={() => applyBaseHome()}
                    >
                      Phụ tùng ô tô
                    </button>
                    <button
                      type="button"
                      className="site-links-btn"
                      onClick={() => applyVehicleQuickFilter("Toyota", "")}
                    >
                      Phụ tùng Toyota
                    </button>
                    <button
                      type="button"
                      className="site-links-btn"
                      onClick={() => applyVehicleQuickFilter("Mazda", "")}
                    >
                      Phụ tùng Mazda
                    </button>
                    <button
                      type="button"
                      className="site-links-btn"
                      onClick={() => applyVehicleQuickFilter("Hyundai", "")}
                    >
                      Phụ tùng Hyundai
                    </button>
                    <button
                      type="button"
                      className="site-links-btn"
                      onClick={() => applyVehicleQuickFilter("Kia", "")}
                    >
                      Phụ tùng Kia
                    </button>
                  </div>
                </div>
                <footer className="footer-main">
                  <div className="footer-top-strip" aria-hidden="true" />
                  <div className="footer-grid">
                    <div className="footer-col footer-brand">
                      <div className="footer-brand-mark">Otofine</div>
                      <p>
                        Nền tảng kết nối người mua và cửa hàng phụ tùng ô tô trên
                        toàn quốc. Tìm đúng phụ tùng, đúng xe, đúng giá.
                      </p>
                    </div>
                    <div className="footer-col">
                      <h3>Hãng xe phổ biến</h3>
                      <button
                        type="button"
                        className="footer-link"
                        onClick={() => applyVehicleQuickFilter("Toyota", "")}
                      >
                        Toyota
                      </button>
                      <button
                        type="button"
                        className="footer-link"
                        onClick={() => applyVehicleQuickFilter("Mazda", "")}
                      >
                        Mazda
                      </button>
                      <button
                        type="button"
                        className="footer-link"
                        onClick={() => applyVehicleQuickFilter("Hyundai", "")}
                      >
                        Hyundai
                      </button>
                      <button
                        type="button"
                        className="footer-link"
                        onClick={() => applyVehicleQuickFilter("Kia", "")}
                      >
                        Kia
                      </button>
                      <button
                        type="button"
                        className="footer-link"
                        onClick={() => applyVehicleQuickFilter("Ford", "")}
                      >
                        Ford
                      </button>
                      <button
                        type="button"
                        className="footer-link"
                        onClick={() => applyVehicleQuickFilter("Honda", "")}
                      >
                        Honda
                      </button>
                    </div>
                    <div className="footer-col">
                      <h3>Hỗ trợ</h3>
                      <a href="/">Giới thiệu</a>
                      <a href="/">Liên hệ</a>
                      <a href="/">Hướng dẫn mua hàng</a>
                      <a href="/">Chính sách bảo mật</a>
                      <a href="/">Điều khoản sử dụng</a>
                    </div>
                  </div>
                  <div className="footer-bottom">
                    © 2026 Otofine.com - Một chi tiết nhỏ, bảo vệ hành trình lớn
                  </div>
                </footer>
              </div>
            </div>
          </div>
        </main>
      </div>
      <nav
        className="of-bottom-nav"
        aria-label="Thao tác nhanh"
      >
        <button
          type="button"
          className="of-bottom-nav__item of-bottom-nav__item--home"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          <span className="of-bottom-nav__icon">🏠</span>
          <span className="of-bottom-nav__label">Trang chủ</span>
        </button>

        <button
          type="button"
          className="of-bottom-nav__item"
          onClick={() => setMobileFilter(true)}
        >
          <span className="of-bottom-nav__icon">🚗</span>
          <span className="of-bottom-nav__label">Chọn xe</span>
        </button>
        <button
          type="button"
          className="of-bottom-nav__item of-bottom-nav__item--quote"
          onClick={() => {
            window.location.href = "https://otofine.com/rfq/new";
          }}
        >
          <span className="of-bottom-nav__icon">$</span>
          <span className="of-bottom-nav__label">Hỏi giá</span>
        </button>
        <button
          type="button"
          className="of-bottom-nav__item"
          onClick={() => {
            const el = document.querySelector(".seo-ab-root") || document.querySelector(".of-trust-market");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          <span className="of-bottom-nav__icon">📚</span>
          <span className="of-bottom-nav__label">Cẩm nang</span>
        </button>
        <button
          type="button"
          className="of-bottom-nav__item"
          onClick={() => setMobileMenu(true)}
        >
          <span className="of-bottom-nav__icon">🏪</span>
          <span className="of-bottom-nav__label">Shop</span>
        </button>
      </nav>
      <Link
        href="/shop/register"
        className="of-seller-float-cta"
        prefetch={false}
      >
        <span className="of-seller-float-cta__icon">🏪</span>
        <span className="of-seller-float-cta__text">Đăng bán</span>
      </Link>
      {contactPhone && (
        <div className="contact-modal" onClick={() => setContactPhone("")}>
          <div className="contact-box" onClick={(e) => e.stopPropagation()}>
            <h4>{contactPhone}</h4>
            <a href={`tel:${contactPhone}`}>📞 Gọi điện</a>
            <a href={`sms:${contactPhone}`}>💬 Nhắn tin SMS</a>
            <a
              href={`https://zalo.me/${contactPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="zalo-call-btn"
            >
              📲 Gọi Zalo
            </a>
            <a
              href={`https://zalo.me/${contactPhone}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              🔵 Chat Zalo
            </a>
            <button onClick={() => setContactPhone("")}>Đóng</button>
          </div>
        </div>
      )}
      {mobileFilter && (
        <div className="mobile-drawer" onClick={closeMobileVehiclePanel}>
          <div className="mobile-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-head">
              <span className="mobile-head-title">Chọn xe</span>
              <button
                type="button"
                className="mobile-head-close"
                onClick={closeMobileVehiclePanel}
                aria-label="Đóng"
              >
                Xem
              </button>
            </div>
            <div className="mobile-filter-body mobile-filter-body--vehicle">
              {renderVehiclePanelBody()}
            </div>
          </div>
        </div>
      )}
      {mobileMenu && (
        <div className="mobile-drawer" onClick={() => setMobileMenu(false)}>
          <div
            className="mobile-panel right-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-head">
              <span className="mobile-head-title">Chọn phụ tùng</span>
              <button
                type="button"
                className="mobile-head-close"
                onClick={() => setMobileMenu(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="mobile-menu-body">
              {renderCategoryPanel(true)}
              {renderLeftQuickBlocks(true)}
            </div>
          </div>
        </div>
      )}
      {mobileQuote && (
        <div className="mobile-drawer" onClick={() => setMobileQuote(false)}>
          <div className="mobile-panel mobile-panel--quote" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-head mobile-head--quote">
              <span className="mobile-head-title">Yêu cầu báo giá phụ tùng</span>
              <button
                type="button"
                className="mobile-head-close"
                onClick={() => setMobileQuote(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="mobile-quote-body">
              <p className="mobile-quote-subtitle">Nhiều shop sẽ nhận yêu cầu và báo giá nhanh.</p>
              <div className="mobile-quote-form">
                <label className="mobile-quote-label">Tên phụ tùng</label>
                <input
                  type="text"
                  className="mobile-quote-input"
                  placeholder="VD: Má phanh Camry 2020"
                />
                <label className="mobile-quote-label">Số khung / VIN (nếu có)</label>
                <input
                  type="text"
                  className="mobile-quote-input"
                  placeholder="VD: JTDBR9HX..."
                />
                <button type="button" className="mobile-quote-upload">
                  📷 Đính kèm ảnh phụ tùng / đăng kiểm
                </button>
                <button type="button" className="mobile-quote-submit">
                  Gửi yêu cầu báo giá
                </button>
              </div>
              <ul className="mobile-quote-trust">
                <li>✓ Nhiều shop nhận yêu cầu</li>
                <li>✓ Báo giá nhanh trong ngày</li>
                <li>✓ Hỗ trợ tìm đúng phụ tùng</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
