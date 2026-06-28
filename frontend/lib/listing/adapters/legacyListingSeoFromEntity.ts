/**
 * Legacy listing SEO bundle mirroring app/[slug]/page.js listingTitleFromEntity +
 * generateMetadata listing fields. Shadow-only — no runtime wiring (ARCH-MP-03B.2).
 */

import { createRequire } from "node:module";
import type { ListingSeoIdentity } from "../ListingIdentity.types";
import type { MarketplaceEntity } from "./identityFromMarketplaceEntity";

const require = createRequire(import.meta.url);

const DEFAULT_SITE_NAME = "Otofine";

function normalizeLocationFromRequestSlug(
  name: string,
  requestSlug: string,
): string {
  const raw = String(name || "").trim();
  if (!raw) return "";

  const locationIndex = String(requestSlug || "").trim().toLowerCase().lastIndexOf("-tai-");
  const requestLocationSlug =
    locationIndex >= 0 ? requestSlug.slice(locationIndex + "-tai-".length).toLowerCase() : "";

  if (requestLocationSlug.startsWith("tp-")) {
    return /^TP Hồ Chí Minh$/i.test(raw) ? "TP Hồ Chí Minh" : raw;
  }
  if (/^TP Hồ Chí Minh$/i.test(raw)) return "TP Hồ Chí Minh";
  if (/^TP\s+/i.test(raw)) return raw.replace(/^TP\s+/i, "").trim();
  return raw;
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

export type LegacyListingSeoFromEntityOptions = {
  siteName?: string;
};

/**
 * Build legacy SSR/client listing SEO from resolved marketplace entity.
 */
export function buildLegacyListingSeoFromEntity(
  entity: MarketplaceEntity | null | undefined,
  options: LegacyListingSeoFromEntityOptions = {},
): ListingSeoIdentity | null {
  if (!entity || entity.kind === "product" || entity.kind === "unknown") {
    return null;
  }

  const listingSeoState = require("../../../components/pages/home/services/listingSeoState.js");
  const listingUrlState = require("../../../components/pages/home/services/listingUrlState.js");

  const siteName = options.siteName || DEFAULT_SITE_NAME;
  const requestSlug = String(entity.requestSlug || "").trim().toLowerCase();
  const meta = entity.categoryMeta || {};
  const filters = entity.landing?.filters || {};
  const parsed = entity.vehicleSeo?.parsed || {};

  let categoryName = "";
  let hasCategory = false;
  let brand = "";
  let model = "";
  let year = "";
  let location = "";
  let category = "";
  let pathState = { category: "", brand: "", model: "", year: "", location: "" };

  if (entity.kind === "vehicle") {
    brand = pickText(parsed.brand, filters.brand);
    model = pickText(parsed.model, filters.model);
    year = pickText(parsed.year, filters.year);
    location = normalizeLocationFromRequestSlug(
      pickText(parsed.locationName, filters.location),
      requestSlug,
    );
    pathState = { category: "", brand, model, year, location };
  } else if (entity.kind === "category") {
    categoryName = pickText(meta.canonicalName, meta.categoryName, filters.category);
    hasCategory = Boolean(categoryName);
    brand = pickText(meta.cbmBrand, filters.brand);
    model = pickText(meta.cbmModel, filters.model);
    year = pickText(meta.cbmYear, filters.year);
    location = normalizeLocationFromRequestSlug(
      pickText(meta.cbmLocation, filters.location),
      requestSlug,
    );
    category = categoryName;
    pathState = { category, brand, model, year, location };
  } else {
    return null;
  }

  const h1 = listingSeoState.buildPageTitle({
    categoryName,
    hasCategory,
    brand,
    model,
    year,
    location,
  });

  const canonicalPath = listingUrlState.buildPathFromState(pathState);

  return {
    displayLabel: h1,
    h1,
    title: `${h1} | ${siteName}`,
    description: h1,
    canonicalPath,
  };
}
