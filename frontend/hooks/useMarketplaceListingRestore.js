"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import {
  buildMarketplaceListingSnapshot,
  saveMarketplaceListingSnapshot,
  markMarketplaceListingProductExit,
  takeMarketplaceListingSnapshotForRestore,
} from "@/lib/listing/marketplaceListingSession";

/**
 * Phase 7K — restore listing filters, cached rows, and scroll on browser back.
 *
 * @param {object} args
 * @param {string} args.pathname
 * @param {(patch: object) => void} args.applyFilters
 * @param {(products: unknown[]) => void} args.setProducts
 * @param {(totalPages: number) => void} args.setTotalPages
 * @param {(bootstrapping: boolean) => void} args.setListBootstrapping
 * @param {(value: string) => void} [args.setSearchInputValue]
 * @param {React.MutableRefObject<boolean>} args.skipProductScrollRef
 * @param {React.MutableRefObject<boolean>} args.isFirstLoadUrlStateRef
 * @param {() => object} args.getCurrentFilters
 * @param {() => unknown[]} args.getProducts
 * @param {() => number} args.getTotalPages
 */
export function useMarketplaceListingRestore({
  pathname,
  applyFilters,
  setProducts,
  setTotalPages,
  setListBootstrapping,
  setSearchInputValue,
  skipProductScrollRef,
  isFirstLoadUrlStateRef,
  getCurrentFilters,
  getProducts,
  getTotalPages,
}) {
  const pendingScrollYRef = useRef(null);
  const skipFetchOnceRef = useRef(false);
  const restoredRef = useRef(false);

  useLayoutEffect(() => {
    if (restoredRef.current || typeof window === "undefined") return;

    const snapshot = takeMarketplaceListingSnapshotForRestore(
      pathname,
      window.location.search,
    );
    if (!snapshot) return;

    restoredRef.current = true;
    isFirstLoadUrlStateRef.current = false;
    skipProductScrollRef.current = true;
    skipFetchOnceRef.current = true;
    pendingScrollYRef.current = snapshot.scrollY;

    applyFilters(snapshot.filters || {});
    if (typeof setSearchInputValue === "function") {
      setSearchInputValue(String(snapshot.filters?.keyword || ""));
    }
    setProducts(Array.isArray(snapshot.products) ? snapshot.products : []);
    setTotalPages(Math.max(1, Number(snapshot.totalPages) || 1));
    setListBootstrapping(false);
  }, [
    pathname,
    applyFilters,
    setProducts,
    setTotalPages,
    setListBootstrapping,
    setSearchInputValue,
    skipProductScrollRef,
    isFirstLoadUrlStateRef,
  ]);

  useLayoutEffect(() => {
    const y = pendingScrollYRef.current;
    if (y == null || typeof window === "undefined") return;

    pendingScrollYRef.current = null;
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, left: 0, behavior: "auto" });
    });
  });

  const saveBeforeProductNavigate = useCallback(() => {
    if (typeof window === "undefined") return;
    const filters = getCurrentFilters();
    const snapshot = buildMarketplaceListingSnapshot({
      filters,
      pathname,
      search: window.location.search,
      scrollY: window.scrollY,
      products: getProducts(),
      totalPages: getTotalPages(),
    });
    saveMarketplaceListingSnapshot(snapshot);
    markMarketplaceListingProductExit();
  }, [pathname, getCurrentFilters, getProducts, getTotalPages]);

  return {
    saveBeforeProductNavigate,
    skipFetchOnceRef,
  };
}
