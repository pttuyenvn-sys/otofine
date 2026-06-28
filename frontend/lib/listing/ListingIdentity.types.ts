/**
 * Canonical marketplace listing identity (ARCH-MP-03).
 *
 * Pipeline:
 *   ListingSelection → normalizeListingIdentity → ListingIdentity
 *     → buildListingDisplayLabel → slug / SEO / query builders
 */

export interface ListingIdentity {
  category: string | null;
  brand: string | null;
  model: string | null;

  /** User-selected fitment year — drives product grid query only. */
  selectedYear: number | null;

  /** Canonical SEO year range — drives display label, H1, URL, and metadata. */
  yearFrom: number | null;
  yearTo: number | null;

  location: string | null;
  keyword: string | null;

  /** Marketplace scope: always null until shop overlay phase. */
  shopId: number | null;
}

/**
 * Raw ingress from UI controls, SSR props, or URL parsers (pre-canonical).
 */
export type ListingSelection = {
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  selectedYear?: number | string | null;
  yearFrom?: number | string | null;
  yearTo?: number | string | null;
  /**
   * Legacy combined year string from URL/state, e.g. `"2020"` or `"2014-2020"`.
   * Maps to SEO range (`yearFrom` / `yearTo`), never to `selectedYear`.
   */
  year?: string | null;
  location?: string | null;
  keyword?: string | null;
  shopId?: number | null;
  page?: number | string | null;
  sort?: string | null;
};

/** Product list API query derived from ListingIdentity. */
export type ListingProductQuery = {
  category: string | null;
  brand: string | null;
  model: string | null;
  /**
   * Fitment filter year (`selectedYear` only).
   * Backend semantics: `year BETWEEN year_from AND year_to`.
   */
  year: number | null;
  location: string | null;
  keyword: string | null;
  page: number;
  sort: string;
};

/** SEO presentation bundle derived from ListingIdentity. */
export type ListingSeo = {
  displayLabel: string;
  h1: string;
  title: string;
  canonicalPath: string;
  description: string;
};

/** Canonical SEO identity — single authority object for SSR metadata (ARCH-MP-03B.2). */
export type ListingSeoIdentity = {
  displayLabel: string;
  h1: string;
  title: string;
  description: string;
  canonicalPath: string;
};
