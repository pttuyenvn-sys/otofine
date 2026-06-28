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
import { dismissMobileSearchKeyboard } from "@/lib/search/dismissMobileSearchKeyboard";
import { API_BASE } from "@/lib/config";
import {
  buildClientListingDisplayLabel,
  buildClientListingPathFromUrlState,
} from "@/lib/listing/adapters/clientListingIdentityEgress";
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
import HomeHeader from "@/components/pages/home/header/HomeHeader";
import HomeSearch from "@/components/pages/home/HomeSearch";
import LeftNav from "@/components/pages/home/listing/LeftNav";
import ProductGridWrapper from "@/components/pages/home/listing/ProductGridWrapper";
import ProductPagination from "@/components/pages/home/listing/ProductPagination";
import { HomeProductCard } from "@/components/pages/home/HomeProductCard";
import PartKnowledgeSeoPage from "@/components/seo/PartKnowledgeSeoPage";
import SeoContent from "@/components/pages/home/seo/SeoContent";
import "@/components/seo/seo-landing.css";
import "./Home.css";
import ListingHero from "@/components/pages/home/listing/ListingHero";
import FilterBar from "@/components/pages/home/filters/FilterBar";
import ListingYearRangeLinks from "@/components/seo/ListingYearRangeLinks";
import ShopRecentlyViewed from "@/components/shopsite/ShopRecentlyViewed";

// ===== CANONICAL URL SYNC HELPERS =====
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import listingHelpers from "@/components/pages/home/services/listingUrlState";
const {
  slugify,
  displayFromSlug,
  rowName,
  cleanQueryValue,
  parseUrlState,
  removeVietnamese,
  buildProductIntent,
  KNOWN_VEHICLE_BRANDS,
} = listingHelpers;
import {
  computeDbCategoryName,
  computeDbLocationName,
  resolveCategoryCanonicalSlug,
  buildUrlState,
  computePopularCategories,
  computePopularQuickKeywords,
} from "@/components/pages/home/services/listingDerivedState";
import {
  deriveSelectedCityFromLocation,
  locationNameForFilterState,
} from "@/components/pages/home/services/locationState";

import {
  buildProductListParams,
  buildFilterCategoriesParams,
  buildLocationsParams,
  buildSuggestParams,
} from "@/components/pages/home/services/listingRequestState";
import {
  buildCategorySuggestNavigation,
  formatCategorySuggestLabel,
} from "@/components/pages/home/services/categorySuggestVehicleContext";
import {
  resolveSearchScope,
  parseSearchIntent,
  resolveSearchApiKeyword,
  shouldFetchSearchSuggest,
} from "@/lib/search/parseSearchIntent";
import {
  buildSearchSuggestCacheKey,
  readSearchSuggestCache,
} from "@/lib/search/searchSuggestCache";
import {
  EMPTY_SEARCH_SUGGEST_RESPONSE,
  fetchSearchSuggest,
} from "@/lib/search/searchSuggestFetch";
import {
  EMPTY_VEHICLE_SPECS,
  fetchListingCatalogSeed,
  fetchListingFilterSnapshot,
  readRecentSearchesFromStorage,
} from "@/components/pages/home/services/listingBootstrapSync";
import TrustSection from "@/components/pages/home/sections/TrustSection";
import QuoteCard from "@/components/pages/home/sections/QuoteCard";
import RightRail from "@/components/pages/home/sections/RightRail";
import { mapMarketplaceToShopDirectoryParams } from "@/components/pages/home/shop/mapMarketplaceToShopDirectoryParams";
import FooterSection from "@/components/pages/home/sections/FooterSection";
import MobileDrawers from "@/components/pages/home/sections/MobileDrawers";
import usePersistedOpen from "@/components/pages/home/hooks/usePersistedOpen";
import useDebouncedValue from "@/components/pages/home/hooks/useDebouncedValue";

// helpers moved to services/listingUrlState.js
// ===== END HELPERS =====

const SUGGEST_FETCH_DEBOUNCE_MS = 300;
const RECENT_SEARCHES_KEY = "otofine_recent_searches_v1";
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
// product intent helpers moved to services/listingUrlState.js

export default function Home({
  premiumArticle = null,
  initialVehicleFilter = null,
  initialListingFilters = null,
  yearRangeLinks = null,
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
  const [mobileShop, setMobileShop] = useState(false);
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
  } = useListingController(
    initialVehicleFilter,
    keywordFromUrl,
    initialListingFilters,
  );

  const [brands, setBrands] = useState([]);
  const [seoVehicleHot, setSeoVehicleHot] = useState(null);
  const [models, setModels] = useState([]);
  const [years, setYears] = useState([]);
  const [specs, setSpecs] = useState(EMPTY_VEHICLE_SPECS);
  const [categories, setCategories] = useState([]);

  const [availableLocations, setAvailableLocations] = useState([]);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const cityDropdownRef = useRef(null);

  const selectedCity = useMemo(
    () => deriveSelectedCityFromLocation(location, availableLocations),
    [location, availableLocations],
  );

  const [products, setProducts] = useState([]);
  const lastFetchKeyRef = useRef(null);
  const isFirstLoadUrlStateRef = useRef(true);
  const needsUrlHydration = Boolean(slug) || initialVehicleFilter != null;
  const [urlHydrationReady, setUrlHydrationReady] = useState(
    !needsUrlHydration || Boolean(initialVehicleFilter?.parsed),
  );
  const [listError, setListError] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [listBootstrapping, setListBootstrapping] = useState(true);
  const [contactPhone, setContactPhone] = useState("");
  const textMeasureRef = useRef(null);
  const productListAnchorRef = useRef(null);
  const skipProductScrollRef = useRef(true);
  const [searchSuggestResponse, setSearchSuggestResponse] = useState(EMPTY_SEARCH_SUGGEST_RESPONSE);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestPanelOpen, setSuggestPanelOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() =>
    readRecentSearchesFromStorage(RECENT_SEARCHES_KEY),
  );
  const [leftPopularOpen, setLeftPopularOpen] = useState(false);
  const [leftRecentOpen, setLeftRecentOpen] = useState(false);

  const dbCategoryName = useMemo(() => computeDbCategoryName(categories, category), [categories, category]);

  const dbLocationName = useMemo(() => computeDbLocationName(availableLocations, location), [availableLocations, location]);

  const listingControllerState = useMemo(
    () => ({
      category,
      brand,
      model,
      year,
      location,
      dbCategoryName,
      dbLocationName,
      keyword,
      page,
      sort,
    }),
    [
      category,
      brand,
      model,
      year,
      location,
      dbCategoryName,
      dbLocationName,
      keyword,
      page,
      sort,
    ],
  );

  const pageTitle = useMemo(
    () =>
      buildClientListingDisplayLabel(listingControllerState, {
        locations: availableLocations,
      }),
    [listingControllerState, availableLocations],
  );

  const buildListingPathForUrlState = useCallback(
    (state) =>
      buildClientListingPathFromUrlState(state, {
        dbCategoryName: computeDbCategoryName(categories, state.category),
        dbLocationName: computeDbLocationName(availableLocations, state.location),
        categoryCanonicalSlug: resolveCategoryCanonicalSlug(categories, state.category),
        locations: availableLocations,
      }),
    [categories, availableLocations],
  );

  const urlState = useMemo(
    () => buildUrlState({ category, brand, model, year, location }),
    [category, brand, model, year, location]
  );

  // Persist mobile vehicle panel open state in sessionStorage.
  usePersistedOpen(MOBILE_VEHICLE_PANEL_OPEN_KEY, mobileFilter, setMobileFilter);

  const closeMobileVehiclePanel = useCallback(() => {
    try {
      sessionStorage.removeItem(MOBILE_VEHICLE_PANEL_OPEN_KEY);
    } catch {
      // ignore
    }
    setMobileFilter(false);
  }, []);

  const closeMobileCategoryPanel = useCallback(() => {
    setMobileMenu(false);
  }, []);

  const closeMobileShopPanel = useCallback(() => {
    setMobileShop(false);
  }, []);

  const navigateToState = useCallback(
    (patch, options = {}) => {
      const { skipRouteUpdate = false } = options;
      const nextState = { ...urlState, ...patch };
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
        const newUrl = buildListingPathForUrlState(nextState);
        if (window.location.pathname !== newUrl) {
          router.replace(newUrl, { scroll: false });
        }
      }
    },
    [
      router,
      urlState,
      setCategory,
      setBrand,
      setModel,
      setYear,
      setLocation,
      buildListingPathForUrlState,
    ],
  );

  const handleLocationSelect = useCallback(
    (catalogRow) => {
      startTransition(() => {
        if (!catalogRow) {
          navigateToState({ location: "" });
        } else {
          navigateToState({ location: locationNameForFilterState(catalogRow) });
        }
        setPage(1);
      });
    },
    [navigateToState, setPage],
  );

  useEffect(() => {
    if (!isFirstLoadUrlStateRef.current) return;

    if (initialVehicleFilter?.parsed) {
      isFirstLoadUrlStateRef.current = false;
      return;
    }

    if (
      !brands.length ||
      !categories.length ||
      !seoVehicleHot?.modelRows?.length
    ) {
      return;
    }

    isFirstLoadUrlStateRef.current = false;

    const parsed = parseUrlState(pathname, {
      categories,
      brands,
      locations: availableLocations,
      vehicleHot: seoVehicleHot,
    });

    startTransition(() => {
      setCategory(parsed.category || "");
      setBrand(parsed.brand || "");
      setModel(parsed.model || "");
      setYear(parsed.year || "");
      setLocation(parsed.location || "");

      setKeyword(keywordFromUrl);

      setPage(1);
      setUrlHydrationReady(true);
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
    if (!activeSlug || /^phu-tung-/.test(activeSlug)) {
      return;
    }

    let cancelled = false;

    async function fetchSeo() {
      try {
        const res = await fetch(
          `/api/seo-page/${encodeURIComponent(activeSlug)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (process.env.NODE_ENV === "development") {
            console.info("[seo-page] skip", activeSlug, res.status);
          }
          if (!cancelled) setSeoData(null);
          return;
        }
        const body = await res.json().catch(() => null);
        if (!body?.found || !body?.data) {
          if (!cancelled) setSeoData(null);
          return;
        }
        if (!cancelled) setSeoData(body.data);
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.info("[seo-page] fetch failed", activeSlug, err);
        }
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

  const handlePopularCategoryClickMobile = useCallback(
    (cat) => {
      handlePopularCategoryClick(cat);
      closeMobileCategoryPanel();
    },
    [handlePopularCategoryClick, closeMobileCategoryPanel],
  );

  // CMS article (seo-page / premiumArticle) → dynamic fallback when absent.
  const finalArticle = useMemo(() => {
    if (finalSeoData) return finalSeoData;
    return {
      source: "dynamic",
      content: buildDynamicListingSeoContent({
        h1: pageTitle,
        products,
        filters: {
          brand,
          model,
          year,
          location,
          city: location,
        },
        selectedCategory: category,
        knowledgeRows: [],
        tier,
      }),
    };
  }, [finalSeoData, pageTitle, brand, model, year, location, category, products, tier]);

  const listFetchAbortRef = useRef(null);
  const suggestAbortRef = useRef(null);
  const suggestRequestIdRef = useRef(0);
  const carBoxRef = useRef(null);
  const searchPanelRef = useRef(null);
  const searchPanelMobileRef = useRef(null);
  const ofSearchInputDesktopRef = useRef(null);
  const ofSearchInputMobileRef = useRef(null);
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

  const applyVehicleQuickFilterMobile = useCallback(
    (brandVal, modelVal) => {
      applyVehicleQuickFilter(brandVal, modelVal);
      closeMobileVehiclePanel();
    },
    [applyVehicleQuickFilter, closeMobileVehiclePanel],
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

        const slug = buildListingPathForUrlState({
          category: "",
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
    [searchInputValue, brand, model, year, location, buildListingPathForUrlState, router]
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
      if (fromMobileSearch) {
        dismissMobileSearchKeyboard(ofSearchInputMobileRef);
      }
      setSuggestPanelOpen(false);
      if (fromMobileSearch) {
        setMobileMenu(false);
        closeMobileVehiclePanel();
      }
      router.push(getProductDetailHref(row));
    },
    [closeMobileVehiclePanel, router],
  );

  const vehicleSuggestContext = useMemo(
    () => ({ brand, model, year, location }),
    [brand, model, year, location],
  );

  const searchIntentDictionaries = useMemo(
    () => ({
      brands,
      modelRows: seoVehicleHot?.modelRows || [],
      categories,
    }),
    [brands, seoVehicleHot, categories],
  );

  const searchListingState = useMemo(() => {
    const q = searchInputValue.trim();
    const intent = parseSearchIntent(q, searchIntentDictionaries);
    return resolveSearchScope(intent, {
      category,
      brand,
      model,
      year,
      location,
    });
  }, [
    searchInputValue,
    category,
    brand,
    model,
    year,
    location,
    searchIntentDictionaries,
  ]);

  const activeSuggestVehicleContext = useMemo(
    () => ({
      brand: searchListingState.brand,
      model: searchListingState.model,
      year: searchListingState.year,
      location: searchListingState.location,
      modelRows: seoVehicleHot?.modelRows || [],
    }),
    [searchListingState, seoVehicleHot],
  );


  const handleSuggestGroupClick = useCallback(
    (group) => {
      const targetUrl = String(group?.url || "").trim();
      const state = {
        category: group?.canonical_name || "",
        brand: group?.brand || activeSuggestVehicleContext.brand || "",
        model: group?.model || activeSuggestVehicleContext.model || "",
        year: group?.year || activeSuggestVehicleContext.year || "",
        location: activeSuggestVehicleContext.location || "",
      };

      startTransition(() => {
        navigateToState(state, { skipRouteUpdate: true });
        if (targetUrl && typeof window !== "undefined") {
          const href = targetUrl.startsWith("/") ? targetUrl : `/${targetUrl}`;
          if (window.location.pathname + window.location.search !== href) {
            router.replace(href, { scroll: false });
          }
        } else {
          const { href, state: navState } = buildCategorySuggestNavigation(
            {
              canonical_name: group?.canonical_name,
              canonical_slug: group?.canonical_slug,
            },
            {
              ...activeSuggestVehicleContext,
              brand: state.brand,
              model: state.model,
              year: state.year,
            },
          );
          navigateToState(navState, { skipRouteUpdate: true });
          if (typeof window !== "undefined" && window.location.pathname !== href) {
            router.replace(href, { scroll: false });
          }
        }
        setKeyword("");
        setSearchInputValue("");
        setSuggestPanelOpen(false);
        setPage(1);
      });
    },
    [
      activeSuggestVehicleContext,
      navigateToState,
      router,
      setKeyword,
      setPage,
      setSearchInputValue,
      setSuggestPanelOpen,
    ],
  );

  const handleCategorySuggestionClick = useCallback(
    (item) => {
      const { href, state } = buildCategorySuggestNavigation(
        item,
        activeSuggestVehicleContext,
      );
      startTransition(() => {
        navigateToState(state, { skipRouteUpdate: true });
        if (typeof window !== "undefined" && window.location.pathname !== href) {
          router.replace(href, { scroll: false });
        }
        setKeyword("");
        setSearchInputValue("");
        setSuggestPanelOpen(false);
        setPage(1);
      });
    },
    [
      activeSuggestVehicleContext,
      navigateToState,
      router,
      setKeyword,
      setPage,
      setSearchInputValue,
      setSuggestPanelOpen,
    ],
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

  // Nhóm A — catalog tĩnh (brands + seoVehicleHot), chỉ load khi mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const catalog = await fetchListingCatalogSeed();

        if (cancelled) return;

        startTransition(() => {
          setBrands(catalog.brands);
          setSeoVehicleHot(catalog.seoVehicleHot);
        });
      } catch {
        if (cancelled) return;
        startTransition(() => {
          setBrands([]);
          setSeoVehicleHot({
            brandNames: [...FALLBACK_SEO_TOP_BRANDS],
            modelRows: [...FALLBACK_SEO_HOT_MODELS],
          });
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Nhóm B — metadata phụ thuộc filter (categories, locations, models, years, specs)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const snapshot = await fetchListingFilterSnapshot({
          category,
          brand,
          model,
          year,
          location,
          keyword,
        });

        if (cancelled) return;

        startTransition(() => {
          setCategories(snapshot.categories);
          setAvailableLocations(snapshot.availableLocations);
          setModels(snapshot.models);
          setYears(snapshot.years);
          setSpecs(snapshot.specs);
        });
      } catch {
        if (cancelled) return;
        startTransition(() => {
          setCategories([]);
          setAvailableLocations([]);
          setModels([]);
          setYears([]);
          setSpecs(EMPTY_VEHICLE_SPECS);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [category, brand, model, year, location, keyword]);

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
    if (!urlHydrationReady) return;

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
        Object.entries(query).forEach(([key, value]) => {
          params.append(key, String(value));
        });

        const paramString = buildProductListParams({
          category,
          brand,
          model,
          year,
          location,
          keyword,
          page,
          sort,
        });
        const url = `${API_BASE}/products${paramString ? `?${paramString}` : ""}`;
        const res = await fetch(url, { signal: ac.signal });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(body?.message || `HTTP ${res.status}`);
        }

        if (cancelled) return;
        if (listFetchAbortRef.current === ac) listFetchAbortRef.current = null;
        const nextProducts = Array.isArray(body?.data) ? body.data : [];
        const tp = Number(body?.totalPages);
        const nextTotalPages = Number.isFinite(tp) && tp >= 1 ? tp : 1;
        startTransition(() => {
          setProducts(nextProducts);
          setTotalPages(nextTotalPages);
          setListBootstrapping(false);
        });
      } catch (e) {
        if (e?.name === "AbortError" || e?.code === 20) return;
        if (cancelled) return;
        setListError(
          "Không tải được danh sách sản phẩm. Hãy chạy backend (npm start trong thư mục backend) và tải lại trang. Nếu API không ở cổng 5000, chỉnh API_INTERNAL_ORIGIN trong frontend hoặc đặt NEXT_PUBLIC_API_BASE_URL.",
        );
        startTransition(() => {
          setProducts([]);
          setTotalPages(1);
          setListBootstrapping(false);
        });
      } finally {
        if (cancelled) return;
        if (ac.signal.aborted) return;
      }
    })();

    return () => {
      cancelled = true;
      if (listFetchAbortRef.current) {
        listFetchAbortRef.current.abort();
        listFetchAbortRef.current = null;
      }
    };
  }, [urlHydrationReady, category, brand, model, year, location, keyword, page, sort]);

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
    document.title = `${pageTitle} | Otofine`;
  }, [pageTitle]);

  // SEARCH-SINGLE-ENDPOINT-01 — one suggest fetch (cache + abort + dedup)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const q = searchInputValue.trim();
      if (!shouldFetchSearchSuggest(q, searchIntentDictionaries)) {
        if (suggestAbortRef.current) {
          suggestAbortRef.current.abort();
          suggestAbortRef.current = null;
        }
        if (!cancelled) {
          setSearchSuggestResponse(EMPTY_SEARCH_SUGGEST_RESPONSE);
          setSuggestLoading(false);
        }
        return;
      }

      if (suggestAbortRef.current) {
        suggestAbortRef.current.abort();
      }
      const ac = new AbortController();
      suggestAbortRef.current = ac;
      const requestId = ++suggestRequestIdRef.current;

      const apiKeyword = resolveSearchApiKeyword(searchListingState, q);
      const scope = {
        brand: searchListingState.brand,
        model: searchListingState.model,
        year: searchListingState.year,
        location: searchListingState.location,
      };
      const cacheKey = buildSearchSuggestCacheKey(apiKeyword, scope);
      const cached = readSearchSuggestCache(cacheKey);

      const isStaleRequest = () =>
        cancelled || ac.signal.aborted || requestId !== suggestRequestIdRef.current;

      if (cached?.response) {
        setSearchSuggestResponse(cached.response);
        setSuggestLoading(false);
      } else {
        setSuggestLoading(true);
      }

      fetchSearchSuggest({
        apiBase: API_BASE,
        apiKeyword,
        scope,
        signal: ac.signal,
      })
        .then((response) => {
          if (isStaleRequest() || !response) return;
          setSearchSuggestResponse(response);
        })
        .catch((e) => {
          if (e?.name === "AbortError" || e?.code === 20) return;
          if (!isStaleRequest()) {
            setSearchSuggestResponse(EMPTY_SEARCH_SUGGEST_RESPONSE);
          }
        })
        .finally(() => {
          if (isStaleRequest()) return;
          if (suggestAbortRef.current === ac) suggestAbortRef.current = null;
          setSuggestLoading(false);
        });
    }, SUGGEST_FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchInputValue, searchListingState, searchIntentDictionaries]);

  // POPULAR + RECENT
  const popularQuickKeywords = useMemo(() => computePopularQuickKeywords(HOT_KEYWORDS, recentSearches), [HOT_KEYWORDS, recentSearches]);

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

  const popularCategories = useMemo(() => computePopularCategories(menuCategories), [menuCategories]);

  const shopDirectoryContext = useMemo(
    () =>
      mapMarketplaceToShopDirectoryParams({
        brand,
        location,
        availableLocations,
      }),
    [brand, location, availableLocations],
  );

  const vehicleQuickPanelProps = useMemo(
    () => ({
      brand,
      model,
      year,
      brands,
      models,
      years,
      open,
      mobileFilter,
      pathname,
      location,
      initialVehicleFilter,
      navigateToState,
      setPage,
      setKeyword,
      setMobileFilter,
      setSeoData,
      setModels,
    }),
    [
      brand,
      model,
      year,
      brands,
      models,
      years,
      open,
      mobileFilter,
      pathname,
      location,
      initialVehicleFilter,
      navigateToState,
      setPage,
      setKeyword,
      setMobileFilter,
    ],
  );

  const renderCategoryPanel = (isMobile = false) => {
    const searchAssistId = `otofine-search-suggest${isMobile ? "-m" : ""}`;
    const hasSearchKeyword = searchInputValue.trim().length > 0;
  const hasQuickSuggest =
    suggestPanelOpen &&
    hasSearchKeyword &&
    Array.isArray(searchSuggestResponse?.groups) &&
    searchSuggestResponse.groups.length > 0;
    const categoryAssistiveId =
      suggestPanelOpen && hasSearchKeyword && !hasQuickSuggest
        ? searchAssistId
        : undefined;

    // For mobile menu without search, limit to first 15 categories
    const displayCategories = isMobile && !hasSearchKeyword
      ? filteredCategories.slice(0, 15)
      : filteredCategories;

    const categorySuggestions = searchSuggestResponse?.categories || [];
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
                    onClick={() => handleCategorySuggestionClick(item)}
                    className="category-link"
                  >
                    <span className="category-name">
                      {formatCategorySuggestLabel(
                        item.canonical_name,
                        activeSuggestVehicleContext,
                      )}
                    </span>
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
    searchSuggestResponse,
    suggestLoading,
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
    handleCategorySuggestionClick,
    handleSuggestGroupClick,
    vehicleSuggestContext: activeSuggestVehicleContext,
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
                brand={brand}
                model={model}
                year={year}
                vehicleQuickPanelProps={vehicleQuickPanelProps}
                seoDisplayModels={seoDisplayModels}
                applyVehicleQuickFilter={applyVehicleQuickFilter}
                popularCategories={popularCategories}
                products={products}
                selectedCategory={category}
                onPopularCategoryClick={handlePopularCategoryClick}
              />
              {/* left rail */}
              <div className="content-right of-home-content">
                {/* ListingHero moved into product module to make product feed cohesive */}
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
                <div className="content-grid of-three-col content-main-row">
                  <div className="content-grid-primary">

                    {/* FilterBar moved into ProductGridWrapper to avoid duplication */}


                    <ProductGridWrapper
                      keyword={keyword}
                      listError={listError}
                      listBootstrapping={listBootstrapping}
                      products={products}
                      setPage={setPage}
                      startTransition={startTransition}
                      navigateToState={navigateToState}
                      setKeyword={setKeyword}
                      setContactPhone={setContactPhone}
                      pageTitle={pageTitle}
                      brand={brand}
                      sort={sort}
                      setSort={setSort}
                      cityDropdownRef={cityDropdownRef}
                      selectedCity={selectedCity}
                      setCityDropdownOpen={setCityDropdownOpen}
                      cityDropdownOpen={cityDropdownOpen}
                      availableLocations={availableLocations}
                      onLocationSelect={handleLocationSelect}
                    />
                    <div className="product-feed-pagination">
                      <ProductPagination
                        listError={listError}
                        listBootstrapping={listBootstrapping}
                        products={products}
                        totalPages={totalPages}
                        page={page}
                        setPage={setPage}
                        scrollProductsIntoView={scrollProductsIntoView}
                      />
                    </div>
                  </div>
                  <RightRail shopDirectoryContext={shopDirectoryContext} />
                </div>

                <div className="content-bottom">
                  {pathname !== "/" && (brand || model || year || keyword || category) && (
                    <ShopRecentlyViewed compact minItems={3} className="mb-4" />
                  )}
                  <TrustSection />
                  {finalArticle && (
                    <SeoContent data={finalArticle} slug={seoArticleSlug} imageProducts={products} />
                  )}
                  <ListingYearRangeLinks section={yearRangeLinks} />
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
                  <FooterSection applyVehicleQuickFilter={applyVehicleQuickFilter} />
                </div>
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
            router.push("/");
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
            router.push("/rfq/new");
          }}
        >
          <span className="of-bottom-nav__icon">$</span>
          <span className="of-bottom-nav__label">Hỏi giá</span>
        </button>
        <button
          type="button"
          className="of-bottom-nav__item"
          onClick={() => setMobileMenu(true)}
        >
          <span className="of-bottom-nav__icon">📋</span>
          <span className="of-bottom-nav__label">Danh mục</span>
        </button>
        <button
          type="button"
          className="of-bottom-nav__item"
          onClick={() => setMobileShop(true)}
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
      <MobileDrawers
        mobileFilter={mobileFilter}
        mobileMenu={mobileMenu}
        mobileShop={mobileShop}
        mobileQuote={mobileQuote}
        closeMobileVehiclePanel={closeMobileVehiclePanel}
        closeMobileCategoryPanel={closeMobileCategoryPanel}
        closeMobileShopPanel={closeMobileShopPanel}
        vehicleQuickPanelProps={vehicleQuickPanelProps}
        seoDisplayModels={seoDisplayModels}
        applyVehicleQuickFilterMobile={applyVehicleQuickFilterMobile}
        popularCategories={popularCategories}
        selectedCategory={category}
        onPopularCategoryClickMobile={handlePopularCategoryClickMobile}
        shopDirectoryContext={shopDirectoryContext}
        setMobileQuote={setMobileQuote}
      />
    </div>
  );
}
