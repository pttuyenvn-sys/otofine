/**
 * ARCH-07.2 — Shop SEO namespace (independent from marketplace NAMESPACE).
 */

export const SHOP_NAMESPACE = Object.freeze({
  SHOP_HOME: "SHOP_HOME",
  SHOP_COLLECTION: "SHOP_COLLECTION",
  SHOP_CATEGORY: "SHOP_CATEGORY",
  SHOP_CATEGORY_BRAND: "SHOP_CATEGORY_BRAND",
  SHOP_CATEGORY_VEHICLE: "SHOP_CATEGORY_VEHICLE",
  SHOP_CATEGORY_VEHICLE_YEAR: "SHOP_CATEGORY_VEHICLE_YEAR",
  SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE: "SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE",
  /** Brand-only vehicle tree — `/phu-tung-{brand}` (no model). */
  SHOP_BRAND: "SHOP_BRAND",
  /** Brand + model vehicle tree — `/phu-tung-{brand}-{model}`. */
  SHOP_VEHICLE: "SHOP_VEHICLE",
  /** @deprecated ARCH-07.3 — keep parser compatibility only. */
  SHOP_VEHICLE_YEAR: "SHOP_VEHICLE_YEAR",
  SHOP_VEHICLE_YEAR_RANGE: "SHOP_VEHICLE_YEAR_RANGE",
});

/** Collection root — replaces legacy `/san-pham` on shop subdomains. */
export const SHOP_COLLECTION_PATH = "/phu-tung-o-to";

/** Static storefront routes (not dynamic SEO landings). */
export const SHOP_STATIC_ROUTES = Object.freeze({
  HOME: "/",
  ABOUT: "/gioi-thieu",
  CONTACT: "/lien-he",
  COLLECTION: SHOP_COLLECTION_PATH,
  LEGACY_COLLECTION: "/san-pham",
});

/** Sitemap entry kinds. */
export const SHOP_SITEMAP_KIND = Object.freeze({
  HOME: "HOME",
  ABOUT: "ABOUT",
  CONTACT: "CONTACT",
  COLLECTION: "COLLECTION",
  SHOP_CATEGORY: "SHOP_CATEGORY",
  SHOP_CATEGORY_BRAND: "SHOP_CATEGORY_BRAND",
  SHOP_CATEGORY_VEHICLE: "SHOP_CATEGORY_VEHICLE",
  SHOP_CATEGORY_VEHICLE_YEAR: "SHOP_CATEGORY_VEHICLE_YEAR",
  SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE: "SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE",
  SHOP_BRAND: "SHOP_BRAND",
  SHOP_VEHICLE: "SHOP_VEHICLE",
  SHOP_VEHICLE_YEAR: "SHOP_VEHICLE_YEAR",
  SHOP_VEHICLE_YEAR_RANGE: "SHOP_VEHICLE_YEAR_RANGE",
});

/** Vehicle SEO path prefix — shop-only (NOT marketplace collection root). */
export const SHOP_VEHICLE_PREFIX = "phu-tung";

/** Shop collection slug segment (same string as marketplace base — host disambiguates). */
export const SHOP_COLLECTION_SLUG = "phu-tung-o-to";
