/**
 * Marketplace-parity vehicle year-range aggregation (BMY range / SEO-04B).
 *
 * Algorithm (from backend/utils/bmyRangeSitemapQuality.server.js):
 * - Use exact fitment year_from/year_to pairs (no per-year expansion).
 * - Normalize pair to min/max; skip single-year pairs (yearFrom === yearTo).
 * - Validate 19xx/20xx tokens.
 * - Group by brand + model + yearFrom + yearTo; count distinct product IDs.
 * - Filter by min product count; sort by count desc then stable slug key.
 *
 * Note: marketplace does NOT merge contiguous ranges — overlapping or
 * adjacent spans remain separate rows keyed by their exact fitment pair.
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidSeoYear(value) {
  const y = Number(value);
  return Number.isFinite(y) && /^(19|20)\d{2}$/.test(String(y));
}

/**
 * @param {unknown} yearFrom
 * @param {unknown} yearTo
 * @returns {{ yearFrom: number, yearTo: number } | null}
 */
export function normalizeYearPair(yearFrom, yearTo) {
  if (!isValidSeoYear(yearFrom) || !isValidSeoYear(yearTo)) return null;
  const yf = Math.min(Number(yearFrom), Number(yearTo));
  const yt = Math.max(Number(yearFrom), Number(yearTo));
  if (yf === yt) return null;
  return { yearFrom: yf, yearTo: yt };
}

/**
 * @param {Array<{ brand?: string, model?: string, year_from?: unknown, year_to?: unknown, yearFrom?: unknown, yearTo?: unknown, product_id?: unknown, productId?: unknown }>} rows
 * @param {{ minProductCount?: number }} [opts]
 * @returns {Array<{ brand: string, model: string, yearFrom: number, yearTo: number, productCount: number }>}
 */
export function aggregateVehicleYearRanges(rows, opts = {}) {
  const minProductCount = Number(opts.minProductCount) || 0;
  /** @type {Map<string, { brand: string, model: string, yearFrom: number, yearTo: number, ids: Set<number> }>} */
  const groups = new Map();

  for (const row of rows || []) {
    const brand = String(row.brand || "").trim();
    const model = String(row.model || "").trim();
    const productId = Number(row.product_id ?? row.productId);
    const pair = normalizeYearPair(
      row.year_from ?? row.yearFrom,
      row.year_to ?? row.yearTo,
    );
    if (!brand || !model || !pair || !Number.isFinite(productId)) continue;

    const key = `${brand}\0${model}\0${pair.yearFrom}\0${pair.yearTo}`;
    if (!groups.has(key)) {
      groups.set(key, {
        brand,
        model,
        yearFrom: pair.yearFrom,
        yearTo: pair.yearTo,
        ids: new Set(),
      });
    }
    groups.get(key).ids.add(productId);
  }

  return [...groups.values()]
    .map((entry) => ({
      brand: entry.brand,
      model: entry.model,
      yearFrom: entry.yearFrom,
      yearTo: entry.yearTo,
      productCount: entry.ids.size,
    }))
    .filter((row) => row.productCount >= minProductCount)
    .sort(
      (a, b) =>
        b.productCount - a.productCount ||
        `${a.brand}\0${a.model}\0${a.yearFrom}`.localeCompare(
          `${b.brand}\0${b.model}\0${b.yearFrom}`,
          "vi",
        ),
    );
}

/**
 * Category-scoped vehicle year-range aggregation (CBMY_RANGE / marketplace sitemap).
 * Same normalization rules as aggregateVehicleYearRanges; group key adds category.
 *
 * @param {Array<{ category?: string, canonical_slug?: string, canonicalSlug?: string, brand?: string, model?: string, year_from?: unknown, year_to?: unknown, yearFrom?: unknown, yearTo?: unknown, product_id?: unknown, productId?: unknown }>} rows
 * @param {{ minProductCount?: number }} [opts]
 * @returns {Array<{ category: string, canonicalSlug: string, brand: string, model: string, yearFrom: number, yearTo: number, productCount: number }>}
 */
export function aggregateCategoryVehicleYearRanges(rows, opts = {}) {
  const minProductCount = Number(opts.minProductCount) || 0;
  /** @type {Map<string, { category: string, canonicalSlug: string, brand: string, model: string, yearFrom: number, yearTo: number, ids: Set<number> }>} */
  const groups = new Map();

  for (const row of rows || []) {
    const category = String(row.category || "").trim();
    const canonicalSlug = String(row.canonical_slug ?? row.canonicalSlug ?? "").trim();
    const brand = String(row.brand || "").trim();
    const model = String(row.model || "").trim();
    const productId = Number(row.product_id ?? row.productId);
    const pair = normalizeYearPair(
      row.year_from ?? row.yearFrom,
      row.year_to ?? row.yearTo,
    );
    if (!category || !canonicalSlug || !brand || !model || !pair || !Number.isFinite(productId)) {
      continue;
    }

    const key = `${category}\0${canonicalSlug}\0${brand}\0${model}\0${pair.yearFrom}\0${pair.yearTo}`;
    if (!groups.has(key)) {
      groups.set(key, {
        category,
        canonicalSlug,
        brand,
        model,
        yearFrom: pair.yearFrom,
        yearTo: pair.yearTo,
        ids: new Set(),
      });
    }
    groups.get(key).ids.add(productId);
  }

  return [...groups.values()]
    .map((entry) => ({
      category: entry.category,
      canonicalSlug: entry.canonicalSlug,
      brand: entry.brand,
      model: entry.model,
      yearFrom: entry.yearFrom,
      yearTo: entry.yearTo,
      productCount: entry.ids.size,
    }))
    .filter((row) => row.productCount >= minProductCount)
    .sort(
      (a, b) =>
        b.productCount - a.productCount ||
        `${a.category}\0${a.brand}\0${a.model}\0${a.yearFrom}`.localeCompare(
          `${b.category}\0${b.brand}\0${b.model}\0${b.yearFrom}`,
          "vi",
        ),
    );
}

/**
 * Location-scoped vehicle year-range aggregation (BMY_RANGE_LOCATION / marketplace sitemap).
 * Same normalization rules as aggregateVehicleYearRanges; group key adds location.
 *
 * @param {Array<{ brand?: string, model?: string, location?: string, year_from?: unknown, year_to?: unknown, yearFrom?: unknown, yearTo?: unknown, product_id?: unknown, productId?: unknown }>} rows
 * @param {{ minProductCount?: number }} [opts]
 * @returns {Array<{ brand: string, model: string, location: string, yearFrom: number, yearTo: number, productCount: number }>}
 */
export function aggregateVehicleYearRangeLocations(rows, opts = {}) {
  const minProductCount = Number(opts.minProductCount) || 0;
  /** @type {Map<string, { brand: string, model: string, location: string, yearFrom: number, yearTo: number, ids: Set<number> }>} */
  const groups = new Map();

  for (const row of rows || []) {
    const brand = String(row.brand || "").trim();
    const model = String(row.model || "").trim();
    const location = String(row.location || "").trim();
    const productId = Number(row.product_id ?? row.productId);
    const pair = normalizeYearPair(
      row.year_from ?? row.yearFrom,
      row.year_to ?? row.yearTo,
    );
    if (!brand || !model || !location || !pair || !Number.isFinite(productId)) continue;

    const key = `${brand}\0${model}\0${pair.yearFrom}\0${pair.yearTo}\0${location}`;
    if (!groups.has(key)) {
      groups.set(key, {
        brand,
        model,
        location,
        yearFrom: pair.yearFrom,
        yearTo: pair.yearTo,
        ids: new Set(),
      });
    }
    groups.get(key).ids.add(productId);
  }

  return [...groups.values()]
    .map((entry) => ({
      brand: entry.brand,
      model: entry.model,
      location: entry.location,
      yearFrom: entry.yearFrom,
      yearTo: entry.yearTo,
      productCount: entry.ids.size,
    }))
    .filter((row) => row.productCount >= minProductCount)
    .sort(
      (a, b) =>
        b.productCount - a.productCount ||
        `${a.brand}\0${a.model}\0${a.yearFrom}`.localeCompare(
          `${b.brand}\0${b.model}\0${b.yearFrom}`,
          "vi",
        ),
    );
}

/**
 * Category + location vehicle year-range aggregation (CBMY_RANGE_LOCATION).
 * Same normalization rules as aggregateCategoryVehicleYearRanges; group key adds location.
 *
 * @param {Array<{ category?: string, canonical_slug?: string, canonicalSlug?: string, brand?: string, model?: string, location?: string, year_from?: unknown, year_to?: unknown, yearFrom?: unknown, yearTo?: unknown, product_id?: unknown, productId?: unknown }>} rows
 * @param {{ minProductCount?: number }} [opts]
 * @returns {Array<{ category: string, canonicalSlug: string, brand: string, model: string, location: string, yearFrom: number, yearTo: number, productCount: number }>}
 */
export function aggregateCategoryVehicleYearRangeLocations(rows, opts = {}) {
  const minProductCount = Number(opts.minProductCount) || 0;
  /** @type {Map<string, { category: string, canonicalSlug: string, brand: string, model: string, location: string, yearFrom: number, yearTo: number, ids: Set<number> }>} */
  const groups = new Map();

  for (const row of rows || []) {
    const category = String(row.category || "").trim();
    const canonicalSlug = String(row.canonical_slug ?? row.canonicalSlug ?? "").trim();
    const brand = String(row.brand || "").trim();
    const model = String(row.model || "").trim();
    const location = String(row.location || "").trim();
    const productId = Number(row.product_id ?? row.productId);
    const pair = normalizeYearPair(
      row.year_from ?? row.yearFrom,
      row.year_to ?? row.yearTo,
    );
    if (
      !category ||
      !canonicalSlug ||
      !brand ||
      !model ||
      !location ||
      !pair ||
      !Number.isFinite(productId)
    ) {
      continue;
    }

    const key = `${category}\0${canonicalSlug}\0${brand}\0${model}\0${pair.yearFrom}\0${pair.yearTo}\0${location}`;
    if (!groups.has(key)) {
      groups.set(key, {
        category,
        canonicalSlug,
        brand,
        model,
        location,
        yearFrom: pair.yearFrom,
        yearTo: pair.yearTo,
        ids: new Set(),
      });
    }
    groups.get(key).ids.add(productId);
  }

  return [...groups.values()]
    .map((entry) => ({
      category: entry.category,
      canonicalSlug: entry.canonicalSlug,
      brand: entry.brand,
      model: entry.model,
      location: entry.location,
      yearFrom: entry.yearFrom,
      yearTo: entry.yearTo,
      productCount: entry.ids.size,
    }))
    .filter((row) => row.productCount >= minProductCount)
    .sort(
      (a, b) =>
        b.productCount - a.productCount ||
        `${a.category}\0${a.brand}\0${a.model}\0${a.yearFrom}`.localeCompare(
          `${b.category}\0${b.brand}\0${b.model}\0${b.yearFrom}`,
          "vi",
        ),
    );
}
