"use client";

import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import { fetchJsonCached } from "@/lib/clientJsonCache";
import {
  filterModelsUrl,
  filterYearsUrl,
  getApiList,
  VEHICLE_MODELS_TTL_MS,
  VEHICLE_YEARS_TTL_MS,
} from "@/lib/vehicle/vehicleFilterApi";
import { resolveInitialQuickVehicle } from "@/components/pages/home/services/listingBootstrapSync";

export const QUICK_VEHICLE_STORAGE_KEY = "otofine_vehicle_quick_v1";
const MOBILE_VEHICLE_PANEL_OPEN_KEY = "otofine_mobile_vehicle_panel_open_v1";

export function useVehicleQuickPanel({
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
  advancedControlRef,
}) {
  const initialQuickVehicle = resolveInitialQuickVehicle(
    initialVehicleFilter,
    QUICK_VEHICLE_STORAGE_KEY,
  );

  const [quickStep, setQuickStep] = useState(initialQuickVehicle.step);
  const [quickDraft, setQuickDraft] = useState(initialQuickVehicle.draft);
  const [draftModels, setDraftModels] = useState([]);
  const [draftModelsLoading, setDraftModelsLoading] = useState(false);
  const [draftYears, setDraftYears] = useState([]);
  const [draftYearsLoading, setDraftYearsLoading] = useState(false);

  const vehiclePanelWasOpenRef = useRef(false);
  const panelModelsFetchKeyRef = useRef("");
  const panelYearsFetchKeyRef = useRef("");

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

  const goToAdvancedFromQuick = useCallback(() => {
    setQuickStep(1);
  }, []);

  useEffect(() => {
    if (!advancedControlRef) return;
    advancedControlRef.current = { goToAdvanced: goToAdvancedFromQuick };
    return () => {
      advancedControlRef.current = null;
    };
  }, [advancedControlRef, goToAdvancedFromQuick]);

  useEffect(() => {
    const isOpen = open || mobileFilter;

    if (!isOpen) {
      vehiclePanelWasOpenRef.current = false;
      return;
    }

    if (vehiclePanelWasOpenRef.current) {
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

    const nextStep = !b ? 1 : !m ? 2 : 3;
    if (
      quickDraft.brand === b &&
      quickDraft.model === m &&
      quickDraft.year === y &&
      quickStep === nextStep
    ) {
      return;
    }

    setQuickDraft((prev) => {
      if (prev.brand === b && prev.model === m && prev.year === y) return prev;
      return { brand: b, model: m, year: y };
    });
    setQuickStep((prev) => (prev === nextStep ? prev : nextStep));
  }, [open, mobileFilter]);

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
    } catch {
      // ignore
    }
  }, [quickDraft]);

  useEffect(() => {
    const isHomepage = pathname === "/";
    const hasVehicleFilter = Boolean(brand || model || year);
    if (!isHomepage || hasVehicleFilter) return;

    startTransition(() => {
      setQuickDraft((prev) => {
        if (!prev.brand && !prev.model && !prev.year) return prev;
        return { brand: "", model: "", year: "" };
      });
      setDraftModels((prev) => (prev.length ? [] : prev));
      setDraftYears((prev) => (prev.length ? [] : prev));
      setQuickStep((prev) => (prev === 1 ? prev : 1));
    });
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
      startTransition(() => {
        setDraftModels([]);
        setDraftModelsLoading(false);
      });
      return;
    }
    if (panelModelsFetchKeyRef.current === b) {
      return;
    }

    const listingBrand = String(brand || "").trim();
    if (b === listingBrand) {
      if (models.length > 0) {
        panelModelsFetchKeyRef.current = b;
        startTransition(() => {
          setDraftModels(models);
          setDraftModelsLoading(false);
        });
      }
      return;
    }

    panelModelsFetchKeyRef.current = b;
    let cancelled = false;
    setDraftModelsLoading(true);
    fetchJsonCached(filterModelsUrl(b), { ttlMs: VEHICLE_MODELS_TTL_MS })
      .then((data) => {
        if (cancelled) return;
        const sorted = [...getApiList(data)].sort(
          (a, b) => (b.total || 0) - (a.total || 0),
        );
        startTransition(() => {
          setDraftModels(sorted);
          setDraftModelsLoading(false);
        });
      })
      .catch(() => {
        if (!cancelled) {
          startTransition(() => {
            setDraftModels([]);
            setDraftModelsLoading(false);
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, mobileFilter, quickDraft.brand, brand, models]);

  useEffect(() => {
    if (!open && !mobileFilter) return;
    const b = String(quickDraft.brand || "").trim();
    const m = String(quickDraft.model || "").trim();
    if (!b || !m) {
      panelYearsFetchKeyRef.current = "";
      startTransition(() => {
        setDraftYears([]);
        setDraftYearsLoading(false);
      });
      return;
    }
    const fetchKey = `${b}::${m}`;
    if (panelYearsFetchKeyRef.current === fetchKey) {
      return;
    }

    const listingBrand = String(brand || "").trim();
    const listingModel = String(model || "").trim();
    if (b === listingBrand && m === listingModel) {
      if (years.length > 0) {
        panelYearsFetchKeyRef.current = fetchKey;
        startTransition(() => {
          setDraftYears(years);
          setDraftYearsLoading(false);
        });
      }
      return;
    }

    panelYearsFetchKeyRef.current = fetchKey;
    let cancelled = false;
    setDraftYearsLoading(true);
    const yUrl = filterYearsUrl(b, m);
    fetchJsonCached(yUrl, { ttlMs: VEHICLE_YEARS_TTL_MS })
      .then((data) => {
        if (cancelled) return;
        const list = getApiList(data);
        startTransition(() => {
          setDraftYears(list);
          setDraftYearsLoading(false);
        });
      })
      .catch(() => {
        if (!cancelled) {
          startTransition(() => {
            setDraftYears([]);
            setDraftYearsLoading(false);
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    mobileFilter,
    quickDraft.brand,
    quickDraft.model,
    brand,
    model,
    years,
  ]);

  const resetQuickVehicle = useCallback(
    (opts = {}) => {
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
    },
    [navigateToState, setKeyword, setPage, setMobileFilter, setModels],
  );

  const handleQuickPickBrand = useCallback(
    (name) => {
      const nextDraft = {
        brand: name,
        model: "",
        year: "",
      };

      setQuickDraft(nextDraft);
      persistQuickVehicleDraft(nextDraft);
      setQuickStep(2);
      panelModelsFetchKeyRef.current = "";
      panelYearsFetchKeyRef.current = "";

      startTransition(() => {
        navigateToState({
          category: "",
          brand: name,
          model: "",
          year: "",
        });
        setSeoData(null);
        setPage(1);
      });
    },
    [navigateToState, persistQuickVehicleDraft, setPage, setSeoData],
  );

  const handleQuickPickModel = useCallback(
    (name) => {
      const currentBrand = quickDraft.brand || brand;

      const nextDraft = {
        brand: currentBrand,
        model: name,
        year: "",
      };

      setQuickDraft(nextDraft);
      persistQuickVehicleDraft(nextDraft);
      setQuickStep(3);
      panelYearsFetchKeyRef.current = "";

      startTransition(() => {
        navigateToState({
          category: "",
          brand: currentBrand,
          model: name,
          year: "",
        });
        setSeoData(null);
        setPage(1);
      });
    },
    [quickDraft.brand, brand, navigateToState, persistQuickVehicleDraft, setPage, setSeoData],
  );

  const handleQuickPickYear = useCallback(
    (y) => {
      const currentBrand = quickDraft.brand || brand || "";
      const currentModel = quickDraft.model || model || "";

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
          year: String(y),
        });
        setSeoData(null);
        setPage(1);
      });
    },
    [
      quickDraft.brand,
      quickDraft.model,
      brand,
      model,
      navigateToState,
      persistQuickVehicleDraft,
      setPage,
      setSeoData,
    ],
  );

  const handleQuickClearYear = useCallback(() => {
    setQuickDraft((d) => ({ ...d, year: "" }));
  }, []);

  const handleQuickBreadcrumb = useCallback(
    (step) => {
      if (step === 1) {
        setQuickDraft({
          brand: "",
          model: "",
          year: "",
        });
        persistQuickVehicleDraft({ brand: "", model: "", year: "" });

        setQuickStep(1);
        panelModelsFetchKeyRef.current = "";
        panelYearsFetchKeyRef.current = "";

        startTransition(() => {
          navigateToState({
            category: "",
            brand: "",
            model: "",
            year: "",
          });
          setSeoData(null);
          setPage(1);
        });

        return;
      }

      if (step === 2) {
        const currentBrand = quickDraft.brand || brand || "";

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
        panelYearsFetchKeyRef.current = "";

        startTransition(() => {
          navigateToState({
            category: "",
            brand: currentBrand,
            model: "",
            year: "",
          });
          setSeoData(null);
          setPage(1);
        });
      }
    },
    [
      quickDraft.brand,
      brand,
      navigateToState,
      persistQuickVehicleDraft,
      setPage,
      setSeoData,
    ],
  );

  return {
    quickStep,
    quickDraft,
    draftModels,
    draftYears,
    draftModelsLoading,
    draftYearsLoading,
    brands,
    onPickBrand: handleQuickPickBrand,
    onPickModel: handleQuickPickModel,
    onPickYear: handleQuickPickYear,
    onClearYear: handleQuickClearYear,
    onBreadcrumbToStep: handleQuickBreadcrumb,
    onReset: mobileFilter
      ? () => resetQuickVehicle({ keepMobileDrawer: true })
      : resetQuickVehicle,
    goToAdvancedFromQuick,
  };
}
