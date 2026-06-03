/**
 * Canonical marketplace context — single source of truth for vehicle/geo
 * semantics across listing, search, product detail, and internal links.
 *
 * @typedef {{
 *   category?: string,
 *   brand?: string,
 *   model?: string,
 *   year?: number,
 *   province?: string,
 * }} MarketplaceContext
 */

import { slugifyVi } from "@/lib/seo/productSeoUrl";
import { MARKETPLACE_LISTING_SESSION_KEY, MARKETPLACE_LISTING_SESSION_TTL_MS } from "@/lib/listing/marketplaceListingSession";

const QUERY_KEYS = Object.freeze({
  brand: "vb",
  model: "vm",
  year: "vy",
  category: "cat",
  province: "pr",
});

function fold(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function querySlug(value) {
  return slugifyVi(String(value || "").trim());
}

function labelFromQuerySlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return "";
  return s
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

/**
 * @param {MarketplaceContext | null | undefined} raw
 * @returns {MarketplaceContext}
 */
export function normalizeMarketplaceContext(raw) {
  const yearRaw = raw?.year;
  const yearNum =
    yearRaw != null && String(yearRaw).trim() !== "" ? Number(yearRaw) : NaN;
  return {
    category: String(raw?.category || "").trim() || undefined,
    brand: String(raw?.brand || "").trim() || undefined,
    model: String(raw?.model || "").trim() || undefined,
    year: Number.isFinite(yearNum) && yearNum > 0 ? yearNum : undefined,
    province:
      String(raw?.province || raw?.location || "").trim() || undefined,
  };
}

/** @param {MarketplaceContext | null | undefined} ctx */
export function isEmptyMarketplaceContext(ctx) {
  const c = normalizeMarketplaceContext(ctx);
  return !c.category && !c.brand && !c.model && !c.year && !c.province;
}

/**
 * @param {Record<string, unknown> | null | undefined} filters
 * @returns {MarketplaceContext}
 */
export function marketplaceContextFromFilters(filters) {
  return normalizeMarketplaceContext({
    category: filters?.category,
    brand: filters?.brand,
    model: filters?.model,
    year: filters?.year,
    province: filters?.location || filters?.province,
  });
}

/** Back-compat alias for listingVehicle shapes. */
export function marketplaceContextFromListingVehicle(listingVehicle) {
  return normalizeMarketplaceContext({
    brand: listingVehicle?.brand,
    model: listingVehicle?.model,
    year: listingVehicle?.year,
  });
}

/**
 * @param {MarketplaceContext} ctx
 * @returns {URLSearchParams}
 */
export function serializeMarketplaceContextQuery(ctx) {
  const c = normalizeMarketplaceContext(ctx);
  const params = new URLSearchParams();
  if (c.brand) params.set(QUERY_KEYS.brand, querySlug(c.brand));
  if (c.model) params.set(QUERY_KEYS.model, querySlug(c.model));
  if (c.year) params.set(QUERY_KEYS.year, String(c.year));
  if (c.category) params.set(QUERY_KEYS.category, querySlug(c.category));
  if (c.province) params.set(QUERY_KEYS.province, querySlug(c.province));
  return params;
}

/**
 * @param {URLSearchParams | string | Record<string, string> | null | undefined} input
 * @returns {MarketplaceContext}
 */
export function parseMarketplaceContextFromQuery(input) {
  /** @type {URLSearchParams} */
  let params;
  if (input instanceof URLSearchParams) {
    params = input;
  } else if (typeof input === "string") {
    params = new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  } else if (input && typeof input === "object") {
    params = new URLSearchParams(input);
  } else {
    params = new URLSearchParams();
  }

  const vb = params.get(QUERY_KEYS.brand);
  const vm = params.get(QUERY_KEYS.model);
  const vy = params.get(QUERY_KEYS.year);
  const cat = params.get(QUERY_KEYS.category);
  const pr = params.get(QUERY_KEYS.province);

  return normalizeMarketplaceContext({
    brand: vb ? labelFromQuerySlug(vb) : undefined,
    model: vm ? labelFromQuerySlug(vm) : undefined,
    year: vy,
    category: cat ? labelFromQuerySlug(cat) : undefined,
    province: pr ? labelFromQuerySlug(pr) : undefined,
  });
}

/**
 * Merge route slug filters + lightweight query context.
 *
 * @param {{
 *   pathname?: string,
 *   searchParams?: URLSearchParams | string | null,
 *   routeFilters?: Record<string, unknown> | null,
 * }} input
 * @returns {MarketplaceContext}
 */
export function parseMarketplaceContextFromRoute({
  pathname: _pathname,
  searchParams,
  routeFilters,
} = {}) {
  const fromQuery = parseMarketplaceContextFromQuery(searchParams);
  const fromRoute = marketplaceContextFromFilters(routeFilters || {});
  if (isEmptyMarketplaceContext(fromQuery)) return fromRoute;
  if (isEmptyMarketplaceContext(fromRoute)) return fromQuery;
  return normalizeMarketplaceContext({
    category: fromQuery.category || fromRoute.category,
    brand: fromQuery.brand || fromRoute.brand,
    model: fromQuery.model || fromRoute.model,
    year: fromQuery.year ?? fromRoute.year,
    province: fromQuery.province || fromRoute.province,
  });
}

/**
 * @param {MarketplaceContext} ctx
 * @returns {string}
 */
export function buildListingPathFromContext(ctx) {
  const c = normalizeMarketplaceContext(ctx);
  const parts = [];
  const hasCategory = !!c.category;
  const hasVehicle = !!(c.brand || c.model || c.year);

  if (hasCategory) {
    parts.push(querySlug(c.category));
    if (!hasVehicle && !c.province) parts.push("o-to");
  } else if (hasVehicle || c.province) {
    parts.push("phu-tung");
  }

  if (c.brand) parts.push(querySlug(c.brand));
  if (c.model) parts.push(querySlug(c.model));
  if (c.year) parts.push(String(c.year));
  if (c.province) {
    parts.push("tai");
    parts.push(querySlug(c.province));
  }

  const slug = parts.filter(Boolean).join("-");
  return slug ? `/${slug}` : "/";
}

/**
 * @param {string} href
 * @param {MarketplaceContext | null | undefined} ctx
 * @returns {string}
 */
export function appendMarketplaceContextQuery(href, ctx) {
  const base = String(href || "").trim();
  if (!base || isEmptyMarketplaceContext(ctx)) return base || "/";

  const extra = serializeMarketplaceContextQuery(ctx);
  const extraQs = extra.toString();
  if (!extraQs) return base;

  const hashIdx = base.indexOf("#");
  const hash = hashIdx >= 0 ? base.slice(hashIdx) : "";
  const pathAndQuery = hashIdx >= 0 ? base.slice(0, hashIdx) : base;
  const qIdx = pathAndQuery.indexOf("?");
  const path = qIdx >= 0 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
  const existing = new URLSearchParams(qIdx >= 0 ? pathAndQuery.slice(qIdx + 1) : "");
  for (const [key, value] of extra.entries()) {
    existing.set(key, value);
  }
  const merged = existing.toString();
  return `${path}${merged ? `?${merged}` : ""}${hash}`;
}

/** @param {unknown} car */
function normalizeCarRow(car) {
  const brand = String(car?.hang_xe || car?.brand || "").trim();
  const model = String(car?.ten_xe || car?.model || "").trim();
  const yearFrom = Number(car?.year_from ?? car?.yearFrom);
  const yearTo = Number(car?.year_to ?? car?.yearTo);
  return {
    brand,
    model,
    yearFrom: Number.isFinite(yearFrom) ? yearFrom : null,
    yearTo: Number.isFinite(yearTo) ? yearTo : null,
  };
}

/** @param {unknown} car @param {MarketplaceContext} ctx */
function carMatchesContext(car, ctx) {
  const row = normalizeCarRow(car);
  const want = normalizeMarketplaceContext(ctx);
  if (want.brand && fold(row.brand) !== fold(want.brand)) return false;
  if (want.model && fold(row.model) !== fold(want.model)) return false;
  if (want.year != null && row.yearFrom != null && row.yearTo != null) {
    if (want.year < row.yearFrom || want.year > row.yearTo) return false;
  }
  return Boolean(want.brand || want.model || want.year != null);
}

/** @param {unknown} car @param {MarketplaceContext} ctx */
export function carMatchesMarketplaceContext(car, ctx) {
  return carMatchesContext(car, ctx);
}

/**
 * @param {unknown[]} cars
 * @param {MarketplaceContext} ctx
 * @returns {MarketplaceContext | null}
 */
export function pickExactFitmentContextFromCars(cars, ctx) {
  if (!Array.isArray(cars) || !cars.length || isEmptyMarketplaceContext(ctx)) {
    return null;
  }
  const match = cars.find((car) => carMatchesContext(car, ctx));
  if (!match) return null;
  const row = normalizeCarRow(match);
  return normalizeMarketplaceContext({
    brand: ctx.brand || row.brand,
    model: ctx.model || row.model,
    year: ctx.year ?? row.yearFrom ?? undefined,
  });
}

/** @param {unknown[]} cars @returns {MarketplaceContext | null} */
export function pickFirstFitmentContextFromCars(cars) {
  if (!Array.isArray(cars) || !cars.length) return null;
  const row = normalizeCarRow(cars[0]);
  if (!row.brand && !row.model) return null;
  return normalizeMarketplaceContext({
    brand: row.brand,
    model: row.model,
    year: row.yearFrom ?? undefined,
  });
}

/**
 * Priority:
 *   1. explicit query context
 *   2. route context
 *   3. listing session context
 *   4. exact compatible fitment
 *   5. first fitment
 *
 * @param {{
 *   queryContext?: MarketplaceContext | null,
 *   routeContext?: MarketplaceContext | null,
 *   sessionContext?: MarketplaceContext | null,
 *   cars?: unknown[] | null,
 * }} input
 * @returns {MarketplaceContext}
 */
export function resolveActiveMarketplaceContext({
  queryContext,
  routeContext,
  sessionContext,
  cars,
} = {}) {
  const pick = (...values) => {
    for (const value of values) {
      if (value == null) continue;
      if (typeof value === "string" && !String(value).trim()) continue;
      return value;
    }
    return undefined;
  };

  const q = normalizeMarketplaceContext(queryContext);
  const r = normalizeMarketplaceContext(routeContext);
  const s = normalizeMarketplaceContext(sessionContext);

  let ctx = normalizeMarketplaceContext({
    category: pick(q.category, r.category, s.category),
    brand: pick(q.brand, r.brand, s.brand),
    model: pick(q.model, r.model, s.model),
    year: pick(q.year, r.year, s.year),
    province: pick(q.province, r.province, s.province),
  });

  const hasVehicleHint = Boolean(ctx.brand || ctx.model || ctx.year != null);
  if (hasVehicleHint) {
    const exact = pickExactFitmentContextFromCars(cars || [], ctx);
    if (exact) {
      ctx = normalizeMarketplaceContext({
        category: ctx.category,
        province: ctx.province,
        brand: ctx.brand || exact.brand,
        model: ctx.model || exact.model,
        year: ctx.year ?? exact.year,
      });
    }
    return ctx;
  }

  const exact = pickExactFitmentContextFromCars(cars || [], ctx);
  if (exact) return normalizeMarketplaceContext({ ...ctx, ...exact });

  const first = pickFirstFitmentContextFromCars(cars || []);
  if (first) return normalizeMarketplaceContext({ ...ctx, ...first });

  return ctx;
}

/** @param {MarketplaceContext | null | undefined} ctx @returns {string} */
export function formatMarketplaceVehicleLabel(ctx) {
  const c = normalizeMarketplaceContext(ctx);
  return [c.brand, c.model, c.year != null ? String(c.year) : ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * Read saved listing filters from sessionStorage (no network).
 * @returns {MarketplaceContext | null}
 */
export function readListingSessionMarketplaceContext() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MARKETPLACE_LISTING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - Number(parsed?.savedAt || 0) > MARKETPLACE_LISTING_SESSION_TTL_MS) {
      return null;
    }
    return marketplaceContextFromFilters(parsed?.filters);
  } catch {
    return null;
  }
}

/**
 * @returns {string | null}
 */
export function readListingSessionRouteKey() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MARKETPLACE_LISTING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - Number(parsed?.savedAt || 0) > MARKETPLACE_LISTING_SESSION_TTL_MS) {
      return null;
    }
    return typeof parsed?.routeKey === "string" ? parsed.routeKey : null;
  } catch {
    return null;
  }
}

/** @param {MarketplaceContext | null | undefined} ctx */
export function resolveListingBackHref(ctx) {
  const routeKey = readListingSessionRouteKey();
  if (routeKey) return routeKey;
  const path = buildListingPathFromContext(ctx || {});
  return path === "/" ? "/" : path;
}

/**
 * Pathname vehicle parsing is intentionally disabled.
 * SEO slugs must never infer MarketplaceContext (i10, Mazda 3, CX-5, etc.).
 *
 * @param {string} [_pathname]
 * @returns {null}
 */
export function parseMarketplaceContextFromPathname(_pathname) {
  return null;
}

/**
 * Parse marketplace context from browser location — query params only.
 *
 * @param {{ pathname?: string, search?: string } | null | undefined} [loc]
 * @returns {MarketplaceContext}
 */
export function parseMarketplaceContextFromLocation(loc) {
  const search =
    loc?.search ??
    (typeof window !== "undefined" ? window.location.search : "");

  return parseMarketplaceContextFromQuery(search);
}

/**
 * Resolve marketplace context for product href generation.
 * When `allowRecovery` is true, falls back to session then query — never pathname.
 *
 * @param {{
 *   marketplaceContext?: MarketplaceContext | null,
 *   listingVehicle?: { brand?: string, model?: string, year?: string | number },
 * }} [options]
 * @param {{ allowRecovery?: boolean }} [config]
 * @returns {MarketplaceContext}
 */
export function resolveMarketplaceContextForHref(options = {}, config = {}) {
  const explicit = normalizeMarketplaceContext(
    options.marketplaceContext ||
      marketplaceContextFromListingVehicle(options.listingVehicle),
  );
  if (!isEmptyMarketplaceContext(explicit)) return explicit;
  if (config.allowRecovery === false) return explicit;
  if (typeof window === "undefined" && !config.loc) return explicit;

  const sessionCtx = readListingSessionMarketplaceContext();
  if (sessionCtx && !isEmptyMarketplaceContext(sessionCtx)) {
    return normalizeMarketplaceContext(sessionCtx);
  }

  return parseMarketplaceContextFromLocation(config.loc);
}

/** @param {MarketplaceContext | null | undefined} ctx */
export function toListingVehicleShape(ctx) {
  const c = normalizeMarketplaceContext(ctx);
  if (isEmptyMarketplaceContext(c)) return null;
  return {
    brand: c.brand || "",
    model: c.model || "",
    ...(c.year != null ? { year: c.year } : {}),
  };
}
