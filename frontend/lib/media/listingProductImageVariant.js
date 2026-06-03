"use client";

import { useSyncExternalStore } from "react";
import { PRODUCT_IMAGE_VARIANT } from "./productMediaUrl";

/** Match storefront / home mobile grid breakpoint (2-col cards). */
export const LISTING_IMAGE_BREAKPOINT_PX = 768;

/** Fixed small slots (search suggest, SEO rails) always use thumb_100. */
export const LISTING_COMPACT_SLOT_MAX_PX = 100;

/** Typical rendered width of a 2-col mobile listing card (~90–120px). */
export const LISTING_MOBILE_RENDER_WIDTH_PX = 120;

/**
 * @param {number|null|undefined} viewportWidth
 */
export function isListingMobileViewport(viewportWidth) {
  if (viewportWidth == null) return true;
  return viewportWidth <= LISTING_IMAGE_BREAKPOINT_PX;
}

/**
 * Deterministic variant for listing/grid surfaces.
 *
 * Phase 7G — mobile-first: SSR/unknown viewport uses thumb_100 so phones never
 * pay for thumb_400 on first paint. Desktop upgrades after hydration.
 *
 * @param {"grid"|"compact"|"large"} slot
 * @param {number|null|undefined} viewportWidth — null on SSR → mobile-first thumb_100
 */
export function resolveListingImageVariant(slot, viewportWidth) {
  if (slot === "compact") {
    return PRODUCT_IMAGE_VARIANT.THUMB_100;
  }
  if (slot === "large") {
    return PRODUCT_IMAGE_VARIANT.THUMB_400;
  }
  if (isListingMobileViewport(viewportWidth)) {
    return PRODUCT_IMAGE_VARIANT.THUMB_100;
  }
  return PRODUCT_IMAGE_VARIANT.THUMB_400;
}

/** Single shared matchMedia subscription for all grid-slot listing images. */
let gridVariantCache = null;
const gridVariantListeners = new Set();
let gridMediaListenerAttached = false;

function readGridVariant() {
  if (typeof window === "undefined") {
    return resolveListingImageVariant("grid", null);
  }
  if (gridVariantCache == null) {
    gridVariantCache = resolveListingImageVariant("grid", window.innerWidth);
  }
  return gridVariantCache;
}

function attachSharedGridMediaListener() {
  if (gridMediaListenerAttached || typeof window === "undefined") return;
  gridMediaListenerAttached = true;

  const media = window.matchMedia(
    `(max-width: ${LISTING_IMAGE_BREAKPOINT_PX}px)`,
  );

  const sync = () => {
    const next = resolveListingImageVariant("grid", window.innerWidth);
    if (next === gridVariantCache) return;
    gridVariantCache = next;
    gridVariantListeners.forEach((listener) => listener());
  };

  sync();
  media.addEventListener("change", sync);
}

function subscribeGridVariant(onStoreChange) {
  attachSharedGridMediaListener();
  gridVariantListeners.add(onStoreChange);
  return () => gridVariantListeners.delete(onStoreChange);
}

function getGridVariantServerSnapshot() {
  return resolveListingImageVariant("grid", null);
}

/**
 * Pick thumb variant for listing surfaces.
 * Grid slot shares one viewport listener across the whole page.
 *
 * @param {"grid"|"compact"|"large"} [slot]
 */
export function useListingImageVariant(slot = "grid") {
  const gridVariant = useSyncExternalStore(
    subscribeGridVariant,
    readGridVariant,
    getGridVariantServerSnapshot,
  );

  if (slot !== "grid") {
    return resolveListingImageVariant(slot, null);
  }

  return gridVariant;
}

/**
 * Infer listing slot from explicit render dimensions (SEO rails, etc.).
 * `fill` alone does not imply thumb_400 — grid slot follows viewport breakpoint.
 * @param {{ width?: number, height?: number, fill?: boolean }} dims
 */
export function inferListingImageSlot({ width, height } = {}) {
  const maxDim = Math.max(Number(width) || 0, Number(height) || 0);
  if (maxDim > 0 && maxDim <= LISTING_COMPACT_SLOT_MAX_PX) {
    return "compact";
  }
  if (maxDim > LISTING_IMAGE_BREAKPOINT_PX) {
    return "large";
  }
  return "grid";
}

/** @internal — reset shared listener state in tests */
export function resetListingImageVariantStoreForTests() {
  gridVariantCache = null;
  gridVariantListeners.clear();
  gridMediaListenerAttached = false;
}
