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
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getProductDetailHref } from "@/lib/productDetailHref";
import { API_BASE } from "@/lib/config";
import { fetchJsonCached } from "@/lib/clientJsonCache";
import {
  EMPTY_HOME_FILTERS,
  buildHomePageTitle,
} from "@/lib/seo/homePageTitle";
import { buildHomeListQueryKey } from "@/lib/seo/homeListQueryKey";
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
import PopularCategoriesBox from "@/components/pages/home/PopularCategoriesBox";
import { SearchSuggestThumb } from "@/components/pages/home/HomeImages";
import { HomeProductCard } from "@/components/pages/home/HomeProductCard";
import VehicleQuickPanel from "@/components/pages/home/VehicleQuickPanel";
import "@/components/seo/seo-landing.css";
import "./Home.css";

export { buildHomePageTitle };

const EMPTY_FILTERS = EMPTY_HOME_FILTERS;

const SUGGEST_FETCH_DEBOUNCE_MS = 400;

const RECENT_SEARCHES_KEY = "otofine_recent_searches_v1";
const QUICK_VEHICLE_STORAGE_KEY = "otofine_vehicle_quick_v1";

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
  initialFromSlug = null,
  premiumArticle = null,
  /** Một entity duy nhất cho trang SEO (slug, H1, danh mục, part id) — ưu tiên hơn state cũ / localStorage. */
  seoListingContext = null,
} = {}) {
  const pathname = usePathname();
  const isSlugSeoPage = pathname !== "/" || Boolean(seoListingContext);
  const [open, setOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mobileFilter, setMobileFilter] = useState(false);
  /** Text đang gõ — chỉ ảnh hưởng suggest + filter danh mục sidebar, không fetch list giữa. */
  const [searchInputValue, setSearchInputValue] = useState("");
  const {
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
  } = useListingController({
    initialFromSlug,
    seoListingContext,
  });
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [brands, setBrands] = useState([]);
  /** Gợi ý chip SEO cuối trang: 8 hãng + 12 dòng (API /filter/vehicle-hot, có fallback). */
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

  const [products, setProducts] = useState([]);
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
  /** Sắp xếp khi gọi /products/list (không có từ khóa). */
  /** Cột trái: tìm nhanh / gần đây — mặc định thu gọn, gõ tìm sẽ đóng. */
  const [leftPopularOpen, setLeftPopularOpen] = useState(false);
  const [leftRecentOpen, setLeftRecentOpen] = useState(false);

  /** Quick flow: draft cho 3 bước; Advanced: giữ select + logic cũ (áp ngay khi đổi). */
  const [filterUiMode, setFilterUiMode] = useState("quick");
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
  const resolvedArticle = useMemo(() => {
    if (isSlugSeoPage) return premiumArticle || null;
    return {
      source: "dynamic",
      content: buildDynamicListingSeoContent({
        h1: pageTitle,
        products,
        selectedCategory,
        filters,
        knowledgeRows: [],
      }),
    };
  }, [isSlugSeoPage, premiumArticle, pageTitle, products, selectedCategory, filters]);

  const router = useRouter();
  const listFetchAbortRef = useRef(null);
  const suggestAbortRef = useRef(null);
  const carBoxRef = useRef(null);
  /** Bao input + gợi ý SP + list danh mục — dùng cho mousedown "click ngoài" (khác .search-combo cũ). */
  const searchPanelRef = useRef(null);
  const searchPanelMobileRef = useRef(null);
  const ofSearchInputDesktopRef = useRef(null);
  const ofSearchInputMobileRef = useRef(null);
  const vehiclePanelWasOpenRef = useRef(false);
  /** key: "d-{name}" sidebar desktop / "m-{name}" drawer mobile — scrollIntoView khi chọn danh mục */
  const categoryItemRefs = useRef(new Map());

  const filtersRef = useRef(filters);
  const selectedCategoryRef = useRef(selectedCategory);
  filtersRef.current = filters;
  selectedCategoryRef.current = selectedCategory;

  const applyBaseHome = useCallback(() => {
    startTransition(() => {
      setPage(1);
      setSearchInputValue("");
      setCommittedKeyword("");
      setSelectedCategory("");
      setFilters({ ...EMPTY_FILTERS });
    });
    setOpen(false);
    setMobileFilter(false);
  }, []);

  /**
   * Một nguồn duy nhất: chọn danh mục cột trái (list + URL sync qua `currentListingUrl` + router.replace).
   * Khi `clearSearch`: bỏ tìm theo từ khóa (đang gõ hoặc đã commit) — tránh còn `q` + /products/search khi chọn mục.
   */
  const applyCategoryFilter = useCallback(
    (name, { clearSearch = false, fromMobileDrawer = false } = {}) => {
      const item = (name == null ? "" : String(name)).trim();
      if (!item) return;
      startTransition(() => {
        setPage(1);
        setSelectedCategory(item);
        if (clearSearch) {
          setSearchInputValue("");
          setCommittedKeyword("");
        }
      });
      setSuggestPanelOpen(false);
      if (fromMobileDrawer) setMobileMenu(false);
    },
    [],
  );

  const applyCategoryFromChip = useCallback(
    (name) => {
      applyCategoryFilter(name, { clearSearch: false });
    },
    [applyCategoryFilter],
  );

  const applyVehicleQuickFilter = useCallback(
    (brand, model) => {
      startTransition(() => {
        setPage(1);
        setSearchInputValue("");
        setCommittedKeyword("");
        setSelectedCategory("");
        setFilters({
          ...EMPTY_FILTERS,
          brand: brand || "",
          model: model || "",
        });
      });
      setOpen(false);
      setMobileFilter(false);
    },
    [],
  );

  const appendListFilters = useCallback((params) => {
    Object.entries(filtersRef.current).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    const sc = selectedCategoryRef.current;
    if (sc) params.append("category", sc);
  }, []);

  const listQueryKey = useMemo(
    () =>
      buildHomeListQueryKey({
        page,
        searchTrigger,
        committedKeyword,
        listSort,
        selectedCategory,
        filters,
      }),
    [
      page,
      searchTrigger,
      committedKeyword,
      listSort,
      selectedCategory,
      filters.brand,
      filters.model,
      filters.year,
      filters.engine,
      filters.displacement,
      filters.transmission,
      filters.drivetrain,
      filters.bodyType,
    ],
  );

  const suggestFilterKey = useMemo(
    () =>
      [
        selectedCategory,
        filters.brand,
        filters.model,
        filters.year,
        filters.engine,
        filters.displacement,
        filters.transmission,
        filters.drivetrain,
        filters.bodyType,
      ].join("\0"),
    [
      selectedCategory,
      filters.brand,
      filters.model,
      filters.year,
      filters.engine,
      filters.displacement,
      filters.transmission,
      filters.drivetrain,
      filters.bodyType,
    ],
  );

  const saveRecentSearch = useCallback((term) => {
    const t = (term || "").trim();
    if (!t) return;
    try {
      const prev = JSON.parse(
        localStorage.getItem(RECENT_SEARCHES_KEY) || "[]",
      );
      const arr = Array.isArray(prev) ? prev : [];
      const next = [t, ...arr.filter((x) => x !== t)].slice(0, 8);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      setRecentSearches(next);
    } catch {
      /* ignore */
    }
  }, []);

  /** Áp keyword đã submit: list + URL đổi theo đây; không gọi khi chỉ onChange ô tìm kiếm. */
  const submitCommittedSearch = useCallback(
    (explicitTerm) => {
      const raw =
        explicitTerm !== undefined && explicitTerm !== null
          ? String(explicitTerm)
          : searchInputValue;
      const t = raw.trim();
      if (t) saveRecentSearch(t);
      startTransition(() => {
        setCommittedKeyword(t);
        setSearchInputValue(t);
        setSelectedCategory("");
        setPage(1);
      });
      setSearchTrigger(Date.now());
      setSuggestPanelOpen(false);
    },
    [searchInputValue, saveRecentSearch],
  );

  const clearSearchCommitted = useCallback(() => {
    startTransition(() => {
      setSearchInputValue("");
      setCommittedKeyword("");
      setPage(1);
    });
    setSearchTrigger(Date.now());
    setSuggestPanelOpen(false);
  }, []);

  /** Cùng HomeProductCard / getProductDetailHref — vào trang chi tiết (client navigation). */
  const handleQuickProductClick = useCallback(
    (row, fromMobileSearch) => {
      if (!row) return;
      setSuggestPanelOpen(false);
      if (fromMobileSearch) {
        setMobileMenu(false);
        setMobileFilter(false);
      }
      router.push(getProductDetailHref(row));
    },
    [router],
  );

  /* Cuộn mép sidebar: đưa mục đang active vào giữa khung nhìn */
  useEffect(() => {
    if (!selectedCategory) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const kd = `d-${selectedCategory}`;
        const km = `m-${selectedCategory}`;
        const el = mobileMenu
          ? categoryItemRefs.current.get(km) ??
            categoryItemRefs.current.get(kd)
          : categoryItemRefs.current.get(kd) ??
            categoryItemRefs.current.get(km);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [selectedCategory, mobileMenu]);

  /* Cuộn tới mép trên danh sách SP (dưới H1 sticky), scroll-margin-top trong CSS bù header + tiêu đề */
  const scrollProductsIntoView = useCallback(() => {
    setTimeout(() => {
      productListAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 30);
  }, []);


  const onPopularCta = useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
      setMobileFilter(true);
    } else {
      setOpen(true);
    }
    scrollProductsIntoView();
  }, [scrollProductsIntoView]);

  const focusHomeSearch = useCallback(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(max-width: 768px)").matches;
    (m ? ofSearchInputMobileRef : ofSearchInputDesktopRef).current?.focus();
  }, []);

  useEffect(() => {
    if (searchInputValue.trim()) {
      setLeftPopularOpen(false);
      setLeftRecentOpen(false);
    }
  }, [searchInputValue]);

  const filteredCategories = useMemo(
    () =>
      categories.filter((item) =>
        removeVietnamese(item).includes(removeVietnamese(searchInputValue)),
      ),
    [categories, searchInputValue],
  );

  /** Hybrid: 4 neo + tối đa 4 từ lịch sử (không trùng), tối đa 8 chip */
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

  const seoDisplayBrands = useMemo(() => {
    if (seoVehicleHot == null) {
      return mergeBrandNamesToLength([], FALLBACK_SEO_TOP_BRANDS, 8);
    }
    return seoVehicleHot.brandNames;
  }, [seoVehicleHot]);

  const seoDisplayModels = useMemo(() => {
    if (seoVehicleHot == null) {
      return mergeModelRowsToLength([], FALLBACK_SEO_HOT_MODELS, 12);
    }
    return seoVehicleHot.modelRows;
  }, [seoVehicleHot]);

  const clearRecentSearches = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      /* ignore */
    }
    setRecentSearches([]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJsonCached(`${API_BASE}/filter/brands`, {
          ttlMs: 300_000,
        });
        if (cancelled) return;
        const sorted = [...(Array.isArray(data) ? data : [])].sort(
          (a, b) => (b.total || 0) - (a.total || 0),
        );
        setBrands(sorted);
      } catch {
        if (!cancelled) setBrands([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Chip SEO: skip network on part-knowledge SEO shell (deterministic rails). */
  useEffect(() => {
    if (seoListingContext) {
      setSeoVehicleHot({
        brandNames: mergeBrandNamesToLength([], FALLBACK_SEO_TOP_BRANDS, 8),
        modelRows: mergeModelRowsToLength([], FALLBACK_SEO_HOT_MODELS, 12),
      });
      return;
    }
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
            8,
          ),
          modelRows: mergeModelRowsToLength(
            modelsFromApi,
            FALLBACK_SEO_HOT_MODELS,
            12,
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
  }, [seoListingContext]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      const arr = JSON.parse(raw || "[]");
      if (Array.isArray(arr)) setRecentSearches(arr.filter(Boolean).slice(0, 8));
    } catch {
      setRecentSearches([]);
    }
  }, []);

  /* Mở panel Chọn xe: reset về Quick mode + hydrate draft (filters hoặc localStorage). */
  useEffect(() => {
    const isOpen = open || mobileFilter;
    if (isOpen && !vehiclePanelWasOpenRef.current) {
      setFilterUiMode("quick");
      let b = filters.brand || "";
      let m = filters.model || "";
      let y = filters.year != null ? String(filters.year) : "";
      if (!b && typeof window !== "undefined") {
        try {
          if (seoListingContext) {
            /* có entity SEO — không hydrate xe từ lần visit trước */
          } else {
          const raw = localStorage.getItem(QUICK_VEHICLE_STORAGE_KEY);
          const o = raw ? JSON.parse(raw) : null;
          if (o?.brand) {
            b = String(o.brand);
            m = o.model ? String(o.model) : "";
            y = o.year != null ? String(o.year) : "";
          }
          }
        } catch {
          /* ignore */
        }
      }
      setQuickDraft({ brand: b, model: m, year: y });
      if (!b) setQuickStep(1);
      else if (!m) setQuickStep(2);
      else setQuickStep(3);
    }
    vehiclePanelWasOpenRef.current = isOpen;
  }, [open, mobileFilter, filters.brand, filters.model, filters.year, seoListingContext]);

  useEffect(() => {
    if (!open && !mobileFilter) return;
    const b = quickDraft.brand;
    if (!b) {
      setDraftModels([]);
      setDraftModelsLoading(false);
      return;
    }
    let cancelled = false;
    setDraftModelsLoading(true);
    fetchJsonCached(
      `${API_BASE}/filter/models?brand=${encodeURIComponent(b)}`,
      { ttlMs: 120_000 },
    )
      .then((data) => {
        if (cancelled) return;
        const sorted = [...(Array.isArray(data) ? data : [])].sort(
          (a, b) => (b.total || 0) - (a.total || 0),
        );
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
    const b = quickDraft.brand;
    const m = quickDraft.model;
    if (!b || !m) {
      setDraftYears([]);
      setDraftYearsLoading(false);
      return;
    }
    let cancelled = false;
    setDraftYearsLoading(true);
    const yUrl = `${API_BASE}/filter/years?brand=${encodeURIComponent(b)}&model=${encodeURIComponent(m)}`;
    fetchJsonCached(yUrl, { ttlMs: 120_000 })
      .then((data) => {
        if (cancelled) return;
        setDraftYears(Array.isArray(data) ? data : []);
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
  }, [open, mobileFilter, quickDraft.brand, quickDraft.model]);

  /* Desktop: click ngoài ô Chọn xe => đóng dropdown. */
  useEffect(() => {
    function onPointerDown(e) {
      if (!open) return;
      const el = carBoxRef.current;
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (el?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  /* ESC: đóng gợi ý tìm kiếm, Chọn xe, mobile filter. */
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (suggestPanelOpen) setSuggestPanelOpen(false);
      if (open) setOpen(false);
      if (mobileFilter) setMobileFilter(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, mobileFilter, suggestPanelOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const live = window.location.pathname + window.location.search;
    if (live === currentListingUrl) return;
    if (isSlugSeoPage) {
      router.push(currentListingUrl, { scroll: false });
      return;
    }
    window.history.replaceState({}, "", currentListingUrl);
  }, [currentListingUrl, isSlugSeoPage, router]);

  useEffect(() => {
    function handleDocMouseDown(e) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (searchPanelRef.current?.contains(t)) return;
      if (searchPanelMobileRef.current?.contains(t)) return;
      setSuggestPanelOpen(false);
    }
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, []);

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
        const p = new URLSearchParams();
        p.append("q", q);
        p.append("limit", "8");
        p.append("page", "1");
        appendListFilters(p);
        const res = await fetch(`${API_BASE}/products/search?${p.toString()}`, {
          signal: ac.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (suggestAbortRef.current === ac) suggestAbortRef.current = null;
        setSuggestItems(Array.isArray(body?.data) ? body.data : []);
      } catch (e) {
        if (e?.name === "AbortError" || e?.code === 20) return;
        if (!cancelled) setSuggestItems([]);
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
  }, [searchInputValue, suggestFilterKey, appendListFilters]);

  useEffect(() => {
    if (!filters.brand) {
      setModels([]);
      return;
    }

    const modelsUrl = `${API_BASE}/filter/models?brand=${encodeURIComponent(
      filters.brand,
    )}`;
    fetchJsonCached(modelsUrl, { ttlMs: 120_000 })
      .then((data) => {
        const sorted = [...(Array.isArray(data) ? data : [])].sort(
          (a, b) => (b.total || 0) - (a.total || 0),
        );
        setModels(sorted);
      })
      .catch(() => setModels([]));
  }, [filters.brand]);

  useEffect(() => {
    if (!filters.brand || !filters.model) {
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
      filters.brand,
    )}&model=${encodeURIComponent(filters.model)}`;
    const sUrl = `${API_BASE}/filter/specs?brand=${encodeURIComponent(
      filters.brand,
    )}&model=${encodeURIComponent(filters.model)}`;

    fetchJsonCached(yUrl, { ttlMs: 120_000 })
      .then((data) => setYears(Array.isArray(data) ? data : []))
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
  }, [filters.brand, filters.model]);

  useEffect(() => {
    const params = new URLSearchParams();

    if (filters.brand) params.append("brand", filters.brand);
    if (filters.model) params.append("model", filters.model);
    if (filters.year) params.append("year", filters.year);

    let cancelled = false;
    (async () => {
      try {
        const url = `${API_BASE}/filter/categories?${params.toString()}`;
        const data = await fetchJsonCached(url, { ttlMs: 120_000 });
        if (!cancelled) setCategories(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.brand, filters.model, filters.year]);

  useEffect(() => {
    if (listFetchAbortRef.current) {
      listFetchAbortRef.current.abort();
    }
    const ac = new AbortController();
    listFetchAbortRef.current = ac;
    let cancelled = false;

    const timer = setTimeout(() => {
      (async () => {
        const activeState = listingState;
        let snap;
        try {
          snap = JSON.parse(activeState.stateKey);
        } catch {
          return;
        }

        setListError("");
        setListBootstrapping(true);
        try {
          const f = snap.filters || {};
          const displayCategory = (snap.selectedCategory || "").trim();
          const productIntent = buildProductIntent(
            selectedCategoryRef.current,
            pageTitle,
          );
          const queryCategories =
            productIntent.variants.length > 0
              ? productIntent.variants
              : displayCategory
                ? [displayCategory]
                : [];
          const kw = String(snap.keyword ?? "").trim();
          const useTypesenseSearch = kw.length > 0;
          const pageNum = snap.page;
          const buildBaseParams = () => {
            const params = new URLSearchParams();
            params.append("page", String(pageNum));
            Object.entries(f).forEach(([k, v]) => {
              if (v) params.append(k, v);
            });
            return params;
          };
          const runFetch = async (categoryValue) => {
            const params = buildBaseParams();
            if (categoryValue) params.append("category", categoryValue);
            let res;
            if (useTypesenseSearch) {
              params.append("q", kw);
              params.append("limit", "16");
              res = await fetch(`${API_BASE}/products/search?${params.toString()}`, {
                signal: ac.signal,
              });
            } else {
              params.append("sort", snap.sort || "popular");
              res = await fetch(`${API_BASE}/products/list?${params.toString()}`, {
                signal: ac.signal,
              });
            }
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(body?.message || `HTTP ${res.status}`);
            }
            return body;
          };

          let body = null;
          const categoryTryList = queryCategories.length > 0 ? queryCategories : [""];
          for (const categoryTry of categoryTryList) {
            body = await runFetch(categoryTry);
            const rows = Array.isArray(body?.data) ? body.data : [];
            if (rows.length > 0) break;
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
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (listFetchAbortRef.current) {
        listFetchAbortRef.current.abort();
        listFetchAbortRef.current = null;
      }
    };
  }, [listingState.stateKey]);

  useEffect(() => {
    if (totalPages < 1) return;
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  /* Cuộn tới vùng danh sách khi dữ liệu đổi (tránh cảm giác “bấm không ăn”) — bỏ qua lần mount đầu */
  useEffect(() => {
    if (skipProductScrollRef.current) {
      skipProductScrollRef.current = false;
      return;
    }
    scrollProductsIntoView();
  }, [listingState.stateKey, scrollProductsIntoView]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = "Otofine";
    document.title =
      pageTitle === "Phụ tùng ô tô"
        ? `${base} — Phụ tùng ô tô đúng xe, minh bạch giá`
        : `${pageTitle} | ${base}`;
  }, [pageTitle]);

  const goToAdvancedFromQuick = useCallback(() => {
    setFilterUiMode("advanced");
    startTransition(() => {
      setFilters((prev) => ({
        ...prev,
        brand: quickDraft.brand || "",
        model: quickDraft.model || "",
        year: quickDraft.year || "",
      }));
    });
  }, [quickDraft.brand, quickDraft.model, quickDraft.year]);

  const goToQuickFromAdvanced = useCallback(() => {
    setFilterUiMode("quick");
    setQuickDraft({
      brand: filters.brand || "",
      model: filters.model || "",
      year: filters.year != null ? String(filters.year) : "",
    });
    if (!filters.brand) setQuickStep(1);
    else if (!filters.model) setQuickStep(2);
    else setQuickStep(3);
  }, [filters.brand, filters.model, filters.year]);

  const applyQuickVehicle = useCallback(() => {
    startTransition(() => {
      setSelectedCategory("");
      setPage(1);
      setFilters({
        ...EMPTY_FILTERS,
        brand: quickDraft.brand,
        model: quickDraft.model,
        year: quickDraft.year,
      });
    });
    try {
      if (typeof window !== "undefined" && quickDraft.brand) {
        localStorage.setItem(
          QUICK_VEHICLE_STORAGE_KEY,
          JSON.stringify({
            brand: quickDraft.brand,
            model: quickDraft.model,
            year: quickDraft.year,
          }),
        );
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
    setMobileFilter(false);
    scrollProductsIntoView();
  }, [quickDraft, scrollProductsIntoView]);

  const resetQuickVehicle = useCallback(() => {
    setQuickDraft({ brand: "", model: "", year: "" });
    setQuickStep(1);
    startTransition(() => {
      setFilters({ ...EMPTY_FILTERS });
      setPage(1);
    });
    setModels([]);
  }, []);

  const handleQuickPickBrand = useCallback((name) => {
    setQuickDraft({ brand: name, model: "", year: "" });
    setQuickStep(2);
  }, []);

  const handleQuickPickModel = useCallback((name) => {
    setQuickDraft((d) => ({ ...d, model: name, year: "" }));
    setQuickStep(3);
  }, []);

  const handleQuickPickYear = useCallback((y) => {
    setQuickDraft((d) => ({ ...d, year: y }));
  }, []);

  const handleQuickClearYear = useCallback(() => {
    setQuickDraft((d) => ({ ...d, year: "" }));
  }, []);

  const handleQuickBreadcrumb = useCallback((step) => {
    if (step === 1) {
      setQuickDraft({ brand: "", model: "", year: "" });
      setQuickStep(1);
    } else if (step === 2) {
      setQuickDraft((d) => ({ ...d, model: "", year: "" }));
      setQuickStep(2);
    }
  }, []);

  const renderFilterForm = () => (
    <>
      <div className="vehicle-advanced-head">
        <span className="vehicle-advanced-head-label">Lọc chi tiết</span>
        <button
          type="button"
          className="vehicle-quick-advanced-btn"
          onClick={(e) => {
            e.stopPropagation();
            goToQuickFromAdvanced();
          }}
        >
          Chọn nhanh
        </button>
      </div>

      <div className="vin-wrap">
        <input
          type="text"
          placeholder="Nhập số VIN"
          className="vin-input"
          autoComplete="off"
          maxLength="17"
        />
        <button className="vin-search">🔍</button>
      </div>

      <div className="filters">
        <select
          className={filters.brand ? "active-filter" : "placeholder"}
          value={filters.brand}
          onChange={(e) => {
            startTransition(() => {
              setSelectedCategory("");
              setPage(1);
              setFilters({
                brand: e.target.value,
                model: "",
                year: "",
                engine: "",
                displacement: "",
                transmission: "",
                drivetrain: "",
                bodyType: "",
              });
            });
          }}
        >
          <option value="">-Hãng xe-</option>
          {brands.map((item, index) => (
            <option
              key={item.hang_xe}
              value={item.hang_xe}
              className={index < 8 ? "hot-option" : ""}
            >
              {item.hang_xe}
            </option>
          ))}
        </select>

        <select
          className={filters.model ? "active-filter" : "placeholder"}
          value={filters.model}
          onChange={(e) => {
            startTransition(() => {
              setSelectedCategory("");
              setPage(1);
              setFilters((prev) => ({ ...prev, model: e.target.value }));
            });
          }}
        >
          <option value="">-Tên xe-</option>
          {models.map((item, index) => (
            <option
              key={item.ten_xe}
              value={item.ten_xe}
              className={index < 8 ? "hot-option" : ""}
            >
              {item.ten_xe}
            </option>
          ))}
        </select>

        <select
          className={filters.year ? "active-filter" : "placeholder"}
          value={filters.year}
          onChange={(e) => {
            startTransition(() => {
              setSelectedCategory("");
              setPage(1);
              setFilters((prev) => ({ ...prev, year: e.target.value }));
            });
          }}
        >
          <option value="">-Năm SX-</option>

          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <select
          className={filters.engine ? "active-filter" : "placeholder"}
          value={filters.engine}
          onChange={(e) => {
            startTransition(() => {
              setPage(1);
              setFilters((prev) => ({ ...prev, engine: e.target.value }));
            });
          }}
        >
          <option value="">-Động cơ-</option>
          {specs.engine.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          className={filters.displacement ? "active-filter" : "placeholder"}
          value={filters.displacement}
          onChange={(e) => {
            startTransition(() => {
              setPage(1);
              setFilters((prev) => ({
                ...prev,
                displacement: e.target.value,
              }));
            });
          }}
        >
          <option value="">-Dung tích-</option>
          {specs.cc.map((item) => (
            <option key={item} value={item}>
              {item} cc
            </option>
          ))}
        </select>

        <select
          className={filters.transmission ? "active-filter" : "placeholder"}
          value={filters.transmission}
          onChange={(e) => {
            startTransition(() => {
              setPage(1);
              setFilters((prev) => ({
                ...prev,
                transmission: e.target.value,
              }));
            });
          }}
        >
          <option value="">-Hộp số-</option>
          {specs.gearbox.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          className={filters.drivetrain ? "active-filter" : "placeholder"}
          value={filters.drivetrain}
          onChange={(e) => {
            startTransition(() => {
              setPage(1);
              setFilters((prev) => ({ ...prev, drivetrain: e.target.value }));
            });
          }}
        >
          <option value="">-Số cầu-</option>
          {specs.drivetrain.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          className={filters.bodyType ? "active-filter" : "placeholder"}
          value={filters.bodyType}
          onChange={(e) => {
            startTransition(() => {
              setPage(1);
              setFilters((prev) => ({ ...prev, bodyType: e.target.value }));
            });
          }}
        >
          <option value="">-Kiểu dáng-</option>
          {specs.bodyType.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <div className="choose-wrap">
        <button
          type="button"
          className="search-btn"
          onClick={() => {
            setOpen(false);
            setMobileFilter(false);
            scrollProductsIntoView();
          }}
        >
          Chọn
        </button>

        <button
          type="button"
          className="clear-filter-btn"
          onClick={() => {
            startTransition(() => {
              setFilters({ ...EMPTY_FILTERS });
              setPage(1);
            });
            setModels([]);
          }}
        >
          ↺ Reset
        </button>
      </div>
    </>
  );

  const renderVehiclePanelBody = () =>
    filterUiMode === "quick" ? (
      <VehicleQuickPanel
        quickStep={quickStep}
        quickDraft={quickDraft}
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
        onReset={resetQuickVehicle}
      />
    ) : (
      renderFilterForm()
    );

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

    const onPickCategoryFromSuggest = (name) => {
      applyCategoryFilter(name, { clearSearch: true });
      setSuggestPanelOpen(false);
      if (isMobile) {
        setMobileMenu(false);
        setMobileFilter(false);
      }
    };

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
                  type="search"
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
                    setSelectedCategory("");
                    setSuggestPanelOpen(true);
                  }}
                  onChange={(e) => {
                    setSearchInputValue(e.target.value);
                    setSelectedCategory("");
                    setSuggestPanelOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitCommittedSearch();
                      if (isMobile) {
                        setMobileMenu(false);
                        setMobileFilter(false);
                      }
                    }
                    if (e.key === "Escape") setSuggestPanelOpen(false);
                  }}
                />

                <span className="measure-text" ref={textMeasureRef}>
                  {searchInputValue}
                </span>

                {searchInputValue.trim() && (
                  <span
                    className="clear-inline"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        clearSearchCommitted();
                      }
                    }}
                    onClick={() => {
                      clearSearchCommitted();
                    }}
                  >
                    ✕
                  </span>
                )}

                <span
                  className="category-icon"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    submitCommittedSearch();
                    if (isMobile) {
                      setMobileMenu(false);
                      setMobileFilter(false);
                    }
                  }}
                >
                  🔍
                </span>
              </div>
            </div>

            {hasQuickSuggest && (
              <div
                id={searchAssistId}
                className="search-suggest-wrap search-suggest-wrap--split"
                role="listbox"
                aria-label="Gợi ý sản phẩm và danh mục"
              >
                <div className="search-suggest-split__products">
                  <ul className="search-suggest-list search-suggest-list--in-split">
                    {suggestItems.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="search-suggest-item"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleQuickProductClick(row, isMobile);
                          }}
                        >
                          <SearchSuggestThumb src={row.image} />
                          <span className="search-suggest-text">
                            <span className="search-suggest-title">
                              {row.shortDescription || row.partName}
                            </span>
                            <span className="search-suggest-meta">
                              {[
                                (Array.isArray(row.cardHighlights) &&
                                row.cardHighlights[0]
                                  ? row.cardHighlights[0]
                                  : null) ||
                                  row.subtitleLine1 ||
                                  (row.partNumber ? `Mã ${row.partNumber}` : ""),
                                row.priceText || "",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div
                  className="search-suggest-split__categories"
                  role="list"
                  aria-label="Danh mục gợi ý"
                >
                  <div className="search-suggest-split__sub">Danh mục</div>
                  <ul className="search-suggest-cat-list">
                    {filteredCategories.length === 0 ? (
                      <li className="search-suggest-category-empty">
                        Không có danh mục khớp
                      </li>
                    ) : (
                      filteredCategories.map((item) => (
                        <li key={item}>
                          <button
                            type="button"
                            className="search-suggest-cat-pill"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onPickCategoryFromSuggest(item)}
                          >
                            {item}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            )}

            {hasCategoryFill && (
              <div
                id={searchAssistId}
                className="search-suggest-wrap search-suggest-wrap--cats-only"
                role="listbox"
                aria-label="Danh mục gợi ý"
              >
                <ul className="search-suggest-cat-list search-suggest-cat-list--solo">
                  {filteredCategories.length === 0 ? (
                    <li className="search-suggest-category-empty">
                      Không có danh mục khớp
                    </li>
                  ) : (
                    filteredCategories.map((item) => (
                      <li key={item}>
                        <button
                          type="button"
                          className="search-suggest-cat-pill"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onPickCategoryFromSuggest(item)}
                        >
                          {item}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
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
            {filteredCategories.length === 0 && hasSearchKeyword ? (
              <li className="search-suggest-category-empty" role="presentation">
                Không có danh mục khớp
              </li>
            ) : (
              filteredCategories.map((item) => (
                <li
                  key={item}
                  ref={(el) => {
                    const k = `${isMobile ? "m" : "d"}-${item}`;
                    if (el) categoryItemRefs.current.set(k, el);
                    else categoryItemRefs.current.delete(k);
                  }}
                  className={selectedCategory === item ? "category-active" : ""}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyCategoryFilter(item, {
                      fromMobileDrawer: isMobile,
                      clearSearch:
                        hasSearchKeyword || committedKeyword.trim().length > 0,
                    });
                  }}
                >
                  {item}
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

  return (
    <div className="of-home-root">
      <HomeHeader
        onOpenFilter={setMobileFilter}
        onOpenMenu={setMobileMenu}
        searchDesktop={null}
        searchMobile={renderSearchPanelOnly(true)}
      />
      <div className="page of-home-page">
        <main className="of-home-main" id="otofine-main" lang="vi">
        <div className="home">
          {/* CONTENT */}
          <div className="container of-home-container">
            {/* LEFT */}
            <div className="car-left">
              <div className="car-box" ref={carBoxRef}>
                {/* Thanh chính */}
                <div className="car-header" onClick={() => setOpen(!open)}>
                  <div className="car-info">
                    <span className="car-icon">🚗</span>
                    <div>
                      <p className="car-header__eyebrow">Hãng xe / Dòng xe / Năm</p>
                      <h4>Chọn xe</h4>
                      {!open && (filters.brand || filters.model || filters.year) ? (
                        <p className="car-header__pick">
                          {[filters.brand, filters.model, filters.year]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : !open ? (
                        <p className="car-header__hint">Bấm để lọc nhanh theo xe</p>
                      ) : null}
                    </div>
                  </div>

                  <span className={`arrow ${open ? "rotate" : ""}`}>⌄</span>
                </div>

                {/* Nội dung ẩn hiện — Quick / Chọn nâng cao */}
                {open && (
                  <div
                    className="car-content car-panel-shell"
                    role="presentation"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderVehiclePanelBody()}
                  </div>
                )}
              </div>

              {renderSearchPanelOnly(false)}

              {renderCategoryPanel(false)}

              {renderLeftQuickBlocks(false)}
            </div>
            <div className="content-right of-home-content">
              <section
                className="listing-hero listing-hero--premium"
                aria-labelledby="listing-h1"
              >
                <div className="listing-hero__top">
                  <div>
                    {seoListingContext ? (
                      <nav className="listing-hero__breadcrumb" aria-label="Breadcrumb">
                        <Link href="/">Trang chủ</Link>
                        {seoListingContext.categoryName ? (
                          <>
                            <span className="listing-hero__breadcrumb-sep" aria-hidden>
                              {" "}
                              ·{" "}
                            </span>
                            <span>{seoListingContext.categoryName}</span>
                          </>
                        ) : null}
                        <span className="listing-hero__breadcrumb-sep" aria-hidden>
                          {" "}
                          ·{" "}
                        </span>
                        <span aria-current="page">{pageTitle}</span>
                      </nav>
                    ) : null}
                    <h1 id="listing-h1" className="listing-hero__h1">
                      {pageTitle}
                    </h1>
                    <p className="listing-hero__sub">
                      Tìm đúng phụ tùng theo xe, so sánh giá, liên hệ trực tiếp
                      cửa hàng — minh bạch, nhanh chóng.
                    </p>
                  </div>
                  <div className="listing-hero__cta-row">
                    <a
                      href="#otofine-products-start"
                      className="listing-hero__cta listing-hero__cta--buyer"
                    >
                      Mua phụ tùng
                    </a>
                    <Link
                      href="/shop/register"
                      className="listing-hero__cta listing-hero__cta--seller"
                      prefetch
                    >
                      Đăng ký bán
                    </Link>
                  </div>
                </div>
                <ul className="listing-hero__badges" role="list">
                  <li role="listitem">Shop xác minh</li>
                  <li role="listitem">Giá rõ ràng</li>
                  <li role="listitem">Hỗ trợ tìm đúng xe</li>
                  <li role="listitem">Tối ưu mobile</li>
                </ul>
              </section>

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
                  {!committedKeyword.trim() && (
                    <div
                      className="listing-sort"
                      role="toolbar"
                      aria-label="Sắp xếp danh sách"
                    >
                      {(
                        [
                          { id: "popular", label: "Phổ biến" },
                          { id: "newest", label: "Mới nhất" },
                          { id: "price_asc", label: "Giá ↑" },
                          { id: "price_desc", label: "Giá ↓" },
                        ]
                      ).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={
                            listSort === s.id
                              ? "listing-sort__btn is-active"
                              : "listing-sort__btn"
                          }
                          aria-pressed={listSort === s.id}
                          onClick={() => {
                            startTransition(() => {
                              setListSort(s.id);
                              setPage(1);
                            });
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="center of-product-list">
                    {!listError && !listBootstrapping && products.length === 0 ? (
                      <p style={{ padding: 16, color: "#6b7280" }}>
                        Chưa có sản phẩm phù hợp. Thử bỏ bộ lọc hoặc kiểm tra dữ
                        liệu trong database.
                      </p>
                    ) : null}
                    {listBootstrapping && products.length === 0 && !listError
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <div
                            key={`sk-${i}`}
                            className="of-product of-product--skeleton"
                            aria-hidden
                          />
                        ))
                      : null}
                    {products.map((item, index) => (
                      <HomeProductCard
                        key={item.id}
                        item={item}
                        index={index}
                        onSelectPhone={setContactPhone}
                      />
                    ))}
                  </div>

                  {!listError &&
                  !listBootstrapping &&
                  products.length > 0 &&
                  totalPages > 1 && (
                    <nav
                      className="pagination product-pagination"
                      aria-label="Phân trang sản phẩm"
                    >
                      <button
                        type="button"
                        className="page-btn page-btn-nav"
                        disabled={page <= 1}
                        aria-label="Trang trước"
                        onClick={() => {
                          setPage((p) => Math.max(1, p - 1));
                          scrollProductsIntoView();
                        }}
                      >
                        &lt;
                      </button>
                      {(() => {
                        const total = totalPages;
                        const current = page;
                        const maxBtns = 5;
                        let start = Math.max(1, current - Math.floor(maxBtns / 2));
                        let end = Math.min(total, start + maxBtns - 1);
                        start = Math.max(1, end - maxBtns + 1);
                        const nums = [];
                        for (let i = start; i <= end; i += 1) nums.push(i);
                        return nums.map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={`page-btn${n === page ? " active" : ""}`}
                            aria-current={n === page ? "page" : undefined}
                            onClick={() => {
                              setPage(n);
                              scrollProductsIntoView();
                            }}
                          >
                            {n}
                          </button>
                        ));
                      })()}
                      <button
                        type="button"
                        className="page-btn page-btn-nav"
                        disabled={page >= totalPages}
                        aria-label="Trang sau"
                        onClick={() => {
                          setPage((p) => Math.min(totalPages, p + 1));
                          scrollProductsIntoView();
                        }}
                      >
                        &gt;
                      </button>
                    </nav>
                  )}
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
                      className="sidebar-cta sidebar-cta--register"
                      prefetch
                    >
                      Đăng ký cửa hàng ngay
                    </Link>
                  </div>

                  <div
                    className="of-rail-card of-rail-links"
                    aria-label="Mua phụ tùng theo hãng &amp; dòng xe"
                  >
                    <h4 className="of-rail-card__h">Mua phụ tùng theo xe</h4>
                    <p className="of-rail-links__p">
                      {seoDisplayBrands.map((b, i) => (
                        <React.Fragment key={b}>
                          {i > 0 && (
                            <span className="of-rail-sep" aria-hidden>
                              {" "}
                              ·{" "}
                            </span>
                          )}
                          <button
                            type="button"
                            className="of-rail-link"
                            onClick={() => applyVehicleQuickFilter(b, "")}
                          >
                            {b}
                          </button>
                        </React.Fragment>
                      ))}
                    </p>
                    <p className="of-rail-links__p">
                      {seoDisplayModels.slice(0, 12).map((row, i) => (
                        <React.Fragment key={`${row.brand}-${row.model}`}>
                          {i > 0 && (
                            <span className="of-rail-sep" aria-hidden>
                              {" "}
                              ·{" "}
                            </span>
                          )}
                          <button
                            type="button"
                            className="of-rail-link of-rail-link--muted"
                            onClick={() =>
                              applyVehicleQuickFilter(row.brand, row.model)
                            }
                          >
                            {row.brand} {row.model}
                          </button>
                        </React.Fragment>
                      ))}
                    </p>
                  </div>

                  <div className="of-rail-cats">
                    <PopularCategoriesBox
                      onCtaClick={onPopularCta}
                      selectedCategory={selectedCategory}
                      onSelectCategory={applyCategoryFromChip}
                    />
                  </div>

                  <div className="of-seller-cta of-seller-cta--rail">
                    <h4 className="of-seller-cta--rail__title">Bạn bán phụ tùng?</h4>
                    <p className="of-seller-cta--rail__text">
                      Nhận khách mua mỗi ngày. Đăng miễn phí.
                    </p>
                    <Link
                      href="/shop/register"
                      className="of-btn-cta of-btn-cta--block"
                      prefetch
                    >
                      Đăng ký bán
                    </Link>
                  </div>
                </aside>
              </div>

              {resolvedArticle?.source === "db" ? (
                <section className="seo-factory-wrap dynamic-home-seo">
                  {resolvedArticle?.introHtml ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: resolvedArticle.introHtml,
                      }}
                    />
                  ) : null}
                  {resolvedArticle?.articleHtml ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: resolvedArticle.articleHtml,
                      }}
                    />
                  ) : null}
                </section>
              ) : resolvedArticle?.source === "seo" ? (
                <div className="seo-factory-wrap">{resolvedArticle.block}</div>
              ) : resolvedArticle?.source === "dynamic" ? (
                <section className="seo-factory-wrap dynamic-home-seo">
                  <h2>{resolvedArticle?.content?.title}</h2>
                  <p>{resolvedArticle?.content?.intro}</p>
                  {(resolvedArticle?.content?.sections || []).map((s, idx) => (
                    <React.Fragment key={`${s.heading}-${idx}`}>
                      <h3>{s.heading}</h3>
                      <p>{s.content}</p>
                    </React.Fragment>
                  ))}
                  {(resolvedArticle?.content?.relatedLinks || []).length > 0 && (
                    <div className="seo-related-links">
                      <h3>Liên kết hữu ích</h3>
                      <ul>
                        {(resolvedArticle?.content?.relatedLinks || []).map((item) => (
                          <li key={item.href}>
                            <a href={item.href}>{item.label}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ) : null}

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
                      t: "Cửa hàng đã xác minh",
                      d: "Thông tin shop rõ ràng trên sàn — tăng niềm tin khi mua.",
                    },
                    {
                      t: "Tìm theo xe và mã phụ tùng",
                      d: "Lọc hãng, dòng, năm hoặc gõ từ khóa — đúng nhu cầu sửa chữa.",
                    },
                    {
                      t: "Minh bạch và liên hệ nhanh",
                      d: "Giá hiển thị, gọi điện hoặc Zalo trực tiếp như marketplace hiện đại.",
                    },
                    {
                      t: "Tốc độ và chuẩn SEO",
                      d: "Trang nhanh, cấu trúc tốt cho tìm kiếm phụ tùng Toyota, Honda, Hyundai, Kia…",
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
                  <Link href="/">Trang chủ</Link>
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
                    <h3>Danh mục nổi bật</h3>
                    <button
                      type="button"
                      className="footer-link"
                      onClick={() => applyCategoryFromChip("Má phanh")}
                    >
                      Má phanh ô tô
                    </button>
                    <button
                      type="button"
                      className="footer-link"
                      onClick={() => applyCategoryFromChip("Lọc dầu")}
                    >
                      Lọc dầu ô tô
                    </button>
                    <button
                      type="button"
                      className="footer-link"
                      onClick={() => applyCategoryFromChip("Gương")}
                    >
                      Gương chiếu hậu
                    </button>
                    <button
                      type="button"
                      className="footer-link"
                      onClick={() => applyCategoryFromChip("Đèn")}
                    >
                      Đèn xe ô tô
                    </button>
                    <button
                      type="button"
                      className="footer-link"
                      onClick={() => applyCategoryFromChip("Giảm xóc")}
                    >
                      Giảm xóc ô tô
                    </button>
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
        <Link href="/" className="of-bottom-nav__item" prefetch scroll={false}>
          Trang chủ
        </Link>
        <button
          type="button"
          className="of-bottom-nav__item"
          onClick={focusHomeSearch}
        >
          Tìm kiếm
        </button>
        <button
          type="button"
          className="of-bottom-nav__item"
          onClick={() => setMobileMenu(true)}
        >
          Danh mục
        </button>
        <button
          type="button"
          className="of-bottom-nav__item of-bottom-nav__item--accent"
          onClick={() => setMobileFilter(true)}
        >
          Chọn xe
        </button>
      </nav>

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
        <div className="mobile-drawer" onClick={() => setMobileFilter(false)}>
          <div className="mobile-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-head">
              <span className="mobile-head-title">Chọn xe</span>
              <button
                type="button"
                className="mobile-head-close"
                onClick={() => setMobileFilter(false)}
                aria-label="Đóng"
              >
                ✕
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
    </div>
  );
}
