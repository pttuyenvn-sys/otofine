"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchFilterBrands,
  fetchFilterModels,
  fetchFilterYears,
} from "@/lib/vehicle/vehicleFilterApi";

const EMPTY = { brand: "", model: "", year: "" };

/**
 * Dependent vehicle filter state — /filter/brands → models → years (Home.jsx parity).
 * RFQ: pass value/onChange and normalize with normalizeVehicleForRfqApi before POST /rfq/create.
 * @param {{ value?: { brand?: string, model?: string, year?: string }, onChange?: (v: typeof EMPTY) => void, enabled?: boolean }} [opts]
 */
export function useVehicleSelector(opts = {}) {
  const { value, onChange, enabled = true } = opts;
  const controlled = value != null;

  const [internal, setInternal] = useState(() => ({
    brand: value?.brand ?? "",
    model: value?.model ?? "",
    year: value?.year != null ? String(value.year) : "",
  }));

  const draft = controlled
    ? {
        brand: value?.brand ?? "",
        model: value?.model ?? "",
        year: value?.year != null ? String(value.year) : "",
      }
    : internal;

  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [years, setYears] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [yearsLoading, setYearsLoading] = useState(false);

  const modelsFetchKeyRef = useRef("");
  const yearsFetchKeyRef = useRef("");

  const emit = useCallback(
    (next) => {
      if (!controlled) setInternal(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );

  const setBrand = useCallback(
    (brand) => {
      const b = String(brand || "").trim();
      emit({ brand: b, model: "", year: "" });
      modelsFetchKeyRef.current = "";
      yearsFetchKeyRef.current = "";
    },
    [emit],
  );

  const setModel = useCallback(
    (model) => {
      const m = String(model || "").trim();
      emit({ brand: draft.brand, model: m, year: "" });
      yearsFetchKeyRef.current = "";
    },
    [draft.brand, emit],
  );

  const setYear = useCallback(
    (year) => {
      const y = year != null ? String(year).trim() : "";
      emit({ brand: draft.brand, model: draft.model, year: y });
    },
    [draft.brand, draft.model, emit],
  );

  const reset = useCallback(() => {
    modelsFetchKeyRef.current = "";
    yearsFetchKeyRef.current = "";
    setModels([]);
    setYears([]);
    emit({ ...EMPTY });
  }, [emit]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setBrandsLoading(true);
    fetchFilterBrands()
      .then((sorted) => {
        if (!cancelled) setBrands(sorted);
      })
      .catch(() => {
        if (!cancelled) setBrands([]);
      })
      .finally(() => {
        if (!cancelled) setBrandsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const b = String(draft.brand || "").trim();
    if (!b) {
      modelsFetchKeyRef.current = "";
      setModels([]);
      setModelsLoading(false);
      return;
    }
    if (modelsFetchKeyRef.current === b) return;
    modelsFetchKeyRef.current = b;
    let cancelled = false;
    setModelsLoading(true);
    fetchFilterModels(b)
      .then((sorted) => {
        if (!cancelled) setModels(sorted);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, draft.brand]);

  useEffect(() => {
    if (!enabled) return;
    const b = String(draft.brand || "").trim();
    const m = String(draft.model || "").trim();
    if (!b || !m) {
      yearsFetchKeyRef.current = "";
      setYears([]);
      setYearsLoading(false);
      return;
    }
    const fetchKey = `${b}::${m}`;
    if (yearsFetchKeyRef.current === fetchKey) return;
    yearsFetchKeyRef.current = fetchKey;
    let cancelled = false;
    setYearsLoading(true);
    fetchFilterYears(b, m)
      .then((list) => {
        if (!cancelled) setYears(list);
      })
      .catch(() => {
        if (!cancelled) setYears([]);
      })
      .finally(() => {
        if (!cancelled) setYearsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, draft.brand, draft.model]);

  return {
    brand: draft.brand,
    model: draft.model,
    year: draft.year,
    setBrand,
    setModel,
    setYear,
    reset,
    brands,
    models,
    years,
    brandsLoading,
    modelsLoading,
    yearsLoading,
  };
}
