/**
 * Product detail SEO-URL builder + parser.
 *
 * URL contract (root-level SEO slugs):
 *
 *   /<slug>-<productId>
 *
 * The trailing numeric segment is the CANONICAL lookup key — the slug
 * prefix is purely cosmetic for SEO + share-card readability. Storage,
 * API lookups, and analytics all use the numeric id; the slug never
 * leaves the URL string.
 *
 * Why root-level (no `/phu-tung/` namespace):
 *   - Shorter URLs → higher SERP CTR.
 *   - Standard ecommerce convention (Amazon /<asin>, Shopee /<slug>-<id>
 *     style, Lazada /products/<slug>-<id> being the exception, etc.).
 *   - The trailing numeric id already guarantees collision-free lookup
 *     so the prefix segment carries no routing weight.
 *
 * Collision safety with apex SEO routes (vehicle, category, CMS):
 *   The `[slug]` apex route owns many non-product slugs. Classifiers must
 *   stay disjoint — see `isMarketplaceListingSlug` and `ROUTE_CONTRACT.md`.
 *   `looksLikeProductSlug` rejects listing slugs before any product-id tail
 *   match. Dev builds log `[RouteInvariant]` if both ever agree.
 *
 * Design constraints (Phase: SEO-friendly product URLs):
 *
 *   1. Pure string logic — no DB, no slug table, no migration.
 *   2. Reversible: extractProductIdFromSeoSlug always returns the same
 *      id regardless of slug drift (typos, renames, missing fields).
 *   3. Idempotent: buildProductSeoSlug(buildProductSeoSlug(x)) == x.
 *   4. Diacritic-safe: Vietnamese accents are stripped via NFD →
 *      basic-latin so the URL is ASCII-only and survives every
 *      crawler / messenger / scrape pipeline cleanly.
 *   5. Length-bounded: the slug portion caps at 140 chars so the
 *      final URL stays under common 2 KB browser/proxy limits and
 *      under Google's recommended ~80-char "human-readable" SERP
 *      length budget. (Most slugs land well below this cap.)
 *
 * The canonical-enforcing route at `app/phu-tung/[slug]/page.js` uses
 * the same helper to compute the canonical URL, then 308-redirects
 * any drifted slug to it. That means callers (cards, search results,
 * RFQ suggestions, sitemap) are free to construct URLs from whatever
 * fields they have on hand — even if the result drifts from canonical,
 * the redirect repairs it on the next request.
 */

import {
  MARKETPLACE_LISTING_SESSION_KEY,
  MARKETPLACE_LISTING_SESSION_TTL_MS,
} from "@/lib/listing/marketplaceListingSession";
import { isMarketplaceListingSlug } from "@/lib/marketplace/isMarketplaceListingSlug";
import {
  isEmptyMarketplaceContext,
  resolveMarketplaceContextForHref,
} from "@/lib/marketplace/marketplaceContext";

const SLUG_MAX_LEN = 140;
const IS_DEV = process.env.NODE_ENV !== "production";
const devWarnedKeys = new Set();
/** Keep in sync with `lib/seo/slugify.js#SEO_BASE_SLUG` */
const SEO_BASE_SLUG_LITERAL = "phu-tung-o-to";

function devPathname() {
  return typeof window !== "undefined" ? window.location.pathname : null;
}

function devReadListingSessionFilters() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MARKETPLACE_LISTING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      Date.now() - Number(parsed?.savedAt || 0) >
      MARKETPLACE_LISTING_SESSION_TTL_MS
    ) {
      return null;
    }
    return parsed?.filters || null;
  } catch {
    return null;
  }
}

function devSessionHasVehicleFilters() {
  const filters = devReadListingSessionFilters();
  if (!filters) return false;
  return Boolean(
    String(filters.brand || "").trim() ||
      String(filters.model || "").trim() ||
      String(filters.year || "").trim(),
  );
}

function devResolveVehicleContext(input, options = {}) {
  return (
    options.marketplaceContext ||
    options.listingVehicle ||
    input?.marketplaceContext ||
    input?.listingVehicle ||
    null
  );
}

function devHasMarketplaceContext(ctx) {
  if (!ctx || typeof ctx !== "object") return false;
  const yearRaw = ctx.year;
  const yearNum =
    yearRaw != null && String(yearRaw).trim() !== "" ? Number(yearRaw) : NaN;
  return Boolean(
    String(ctx.category || "").trim() ||
      String(ctx.brand || "").trim() ||
      String(ctx.model || "").trim() ||
      (Number.isFinite(yearNum) && yearNum > 0) ||
      String(ctx.province || ctx.location || "").trim(),
  );
}

function devProductId(input) {
  return input?.id ?? input?.productId ?? input?.product_id ?? "unknown";
}

function devProductDiagPayload(input, options = {}) {
  return {
    productId: devProductId(input),
    slug: input?.slug ?? null,
    pathname: devPathname(),
    sessionFilters: devReadListingSessionFilters(),
    hasCars: Array.isArray(input?.cars) && input.cars.length > 0,
    carsCount: Array.isArray(input?.cars) ? input.cars.length : 0,
    vehicleContext: devResolveVehicleContext(input, options),
  };
}

function devWarnOnce(key, message, payload) {
  if (!IS_DEV || devWarnedKeys.has(key)) return;
  devWarnedKeys.add(key);
  console.warn(message, payload);
}

/**
 * Dev-only: true when href generation likely originates from marketplace listing UI.
 * Uses listing session filters + pathname heuristics (client-only).
 */
export function isMarketplaceListingNavigation() {
  if (typeof window === "undefined") return false;
  if (devSessionHasVehicleFilters()) return true;

  const pathname = window.location.pathname || "/";
  if (pathname === "/") return true;

  const slug = pathname.replace(/^\//, "").split("?")[0];
  if (!slug) return false;

  if (
    slug === SEO_BASE_SLUG_LITERAL ||
    slug.startsWith(`${SEO_BASE_SLUG_LITERAL}-`) ||
    slug.startsWith("phu-tung")
  ) {
    return true;
  }

  if (looksLikeProductSlug(slug)) return false;
  if (slug.endsWith("-o-to")) return true;

  return false;
}

/** Dev-only: warn when listing navigation omits marketplaceContext on href build. */
export function devWarnMissingMarketplaceContext(input, options = {}) {
  if (!IS_DEV || !isMarketplaceListingNavigation()) return;

  const vehicleContext = devResolveVehicleContext(input, options);
  if (devHasMarketplaceContext(vehicleContext)) return;

  devWarnOnce(
    `missing-ctx:${devProductId(input)}`,
    "[MarketplaceContext] Missing context for href generation",
    devProductDiagPayload(input, options),
  );
}

function devWarnCarsFitmentFallback(input, pickedCar, vehicleSource = "cars") {
  if (!IS_DEV || !isMarketplaceListingNavigation()) return;

  const vehicleContext = devResolveVehicleContext(input, {});
  if (devHasMarketplaceContext(vehicleContext)) return;

  devWarnOnce(
    `slug-vehicle:${vehicleSource}:${devProductId(input)}`,
    `[MarketplaceContext] Slug fitment fallback via ${vehicleSource}`,
    {
      ...devProductDiagPayload(input, {}),
      vehicleSource,
      fitmentUsed: pickedCar
        ? {
            brand: pickedCar.brand,
            model: pickedCar.model,
            yearFrom: pickedCar.yFrom,
            yearTo: pickedCar.yTo,
            carsIndex: pickedCar.idx ?? null,
          }
        : null,
    },
  );
}

/** @type {ProductSeoSlugTrace | null} */
let lastSlugBuildTrace = null;

/**
 * Dev-only: last slug build trace (vehicle source, fitment picked, caller path).
 * @returns {ProductSeoSlugTrace | null}
 */
export function getLastProductSeoSlugTrace() {
  return IS_DEV ? lastSlugBuildTrace : null;
}

function devRecordSlugBuildTrace(trace) {
  if (!IS_DEV) return;
  lastSlugBuildTrace = trace;
  if (typeof window !== "undefined") {
    const bucket = window.__OTOFINE_SLUG_TRACES__;
    if (Array.isArray(bucket)) {
      bucket.push(trace);
      if (bucket.length > 50) bucket.shift();
    } else {
      window.__OTOFINE_SLUG_TRACES__ = [trace];
    }
  }
}

function devWarnSlugVehicleSource(input, trace) {
  if (!IS_DEV || !isMarketplaceListingNavigation()) return;
  if (!trace || trace.vehicleSource === "none") return;
  if (
    trace.vehicleSource === "marketplaceContext" ||
    trace.vehicleSource === "listingVehicle"
  ) {
    return;
  }

  devWarnCarsFitmentFallback(input, trace.vehicleFitment, trace.vehicleSource);
}

function devWarnUnsafeFallbackSuppressed(input, trace) {
  if (!IS_DEV || !trace?.vehicleFallbackSuppressed) return;

  devWarnOnce(
    `suppressed:${devProductId(input)}`,
    "[MarketplaceContext] Unsafe vehicle slug fallback suppressed (marketplace nav)",
    {
      ...devProductDiagPayload(input, {}),
      vehicleSource: trace.vehicleSource,
      slug: trace.slug,
    },
  );
}

/**
 * @typedef {"none" | "marketplaceContext" | "listingVehicle" | "matchedFitment" | "cars" | "flat"} ProductSeoVehicleSource
 */

/**
 * @typedef {{
 *   slug: string,
 *   vehicleSource: ProductSeoVehicleSource,
 *   vehicleFitment: { brand?: string, model?: string, yFrom?: number | null, yTo?: number | null, idx?: number } | null,
 *   vehicleFallbackSuppressed?: boolean,
 *   productId: string | number | null,
 *   at: number,
 *   pathname: string | null,
 * }} ProductSeoSlugTrace
 */

/**
 * Build slug prefix + vehicle-source metadata for tracing leaks.
 *
 * @param {Record<string, unknown> | null | undefined} input
 * @returns {ProductSeoSlugTrace}
 */
export function buildProductSeoSlugWithMeta(input) {
  const emptyTrace = {
    slug: "",
    vehicleSource: /** @type {ProductSeoVehicleSource} */ ("none"),
    vehicleFitment: null,
    productId: devProductId(input),
    at: Date.now(),
    pathname: devPathname(),
  };

  if (!input || typeof input !== "object") {
    devRecordSlugBuildTrace(emptyTrace);
    return emptyTrace;
  }

  // Product name candidates, ordered by descriptiveness.
  const nameRaw =
    input.partName ||
    input.name ||
    input.title ||
    input.shortDescription ||
    "";
  const name = stripHtml(nameRaw).trim();

  /** @type {ProductSeoVehicleSource} */
  let vehicleSource = "none";
  let car = null;
  const suppressUnsafe = input.suppressUnsafeVehicleFallback === true;

  if (input.marketplaceContext) {
    car = carFromListingVehicleFilter(input.marketplaceContext);
    if (car) vehicleSource = "marketplaceContext";
  }
  if (!car && input.listingVehicle) {
    car = carFromListingVehicleFilter(input.listingVehicle);
    if (car) vehicleSource = "listingVehicle";
  }
  if (!car && input.matchedFitment) {
    car = carFromListingVehicleFilter({
      brand: input.matchedFitment.brand,
      model: input.matchedFitment.model,
      year: input.matchedFitment.yearFrom ?? input.matchedFitment.yearTo,
    });
    if (car) vehicleSource = "matchedFitment";
  }
  if (!car && !suppressUnsafe && Array.isArray(input.cars) && input.cars.length > 0) {
    car = pickPrimaryCar(input.cars);
    if (car) vehicleSource = "cars";
  }
  if (!car && !suppressUnsafe) {
    const flatBrand = input.brand || input.hang_xe || "";
    const flatModel = input.model || input.ten_xe || "";
    const flatFrom = input.yearFrom ?? input.year_from ?? null;
    const flatTo = input.yearTo ?? input.year_to ?? null;
    if (flatBrand || flatModel || flatFrom || flatTo) {
      car = { brand: flatBrand, model: flatModel, yFrom: flatFrom, yTo: flatTo };
      vehicleSource = "flat";
    }
  }

  const hadUnsafeVehicleCandidates =
    (Array.isArray(input.cars) && input.cars.length > 0) ||
    Boolean(
      input.brand ||
        input.hang_xe ||
        input.model ||
        input.ten_xe ||
        input.yearFrom ||
        input.year_from ||
        input.yearTo ||
        input.year_to,
    );
  const vehicleFallbackSuppressed =
    suppressUnsafe && !car && hadUnsafeVehicleCandidates;

  const partNumberRaw = input.partNumber || input.part_number || "";
  const partNumber = String(partNumberRaw).replace(/[^A-Za-z0-9]+/g, "");

  let yearPart = "";
  if (car) {
    const yf = car.yFrom != null && car.yFrom !== "" ? Number(car.yFrom) : null;
    const yt = car.yTo != null && car.yTo !== "" ? Number(car.yTo) : null;
    if (Number.isFinite(yf) && yf > 0) yearPart = String(yf);
    else if (Number.isFinite(yt) && yt > 0) yearPart = String(yt);
  }

  const pieces = [name];
  if (car?.brand) pieces.push(String(car.brand));
  if (car?.model) pieces.push(String(car.model));
  if (yearPart) pieces.push(yearPart);
  if (partNumber) pieces.push(String(partNumber));

  const trace = {
    slug: slugifyVi(pieces.filter(Boolean).join(" ")),
    vehicleSource,
    vehicleFitment: car
      ? {
          brand: car.brand,
          model: car.model,
          yFrom: car.yFrom ?? null,
          yTo: car.yTo ?? null,
          idx: car.idx ?? null,
        }
      : null,
    vehicleFallbackSuppressed,
    productId: devProductId(input),
    at: Date.now(),
    pathname: devPathname(),
  };

  devRecordSlugBuildTrace(trace);
  devWarnSlugVehicleSource(input, trace);
  devWarnUnsafeFallbackSuppressed(input, trace);
  return trace;
}

/**
 * Slugify Vietnamese text into a URL-safe kebab-case ASCII string.
 *
 * Steps:
 *   1. Normalize NFD then strip combining marks → drops é/â/ô/etc.
 *   2. Replace đ/Đ with d (NFD does NOT split these).
 *   3. Lowercase.
 *   4. Replace every non-alphanumeric run with a single hyphen.
 *   5. Trim leading/trailing hyphens.
 *   6. Hard cap to SLUG_MAX_LEN, then re-trim.
 */
export function slugifyVi(text) {
  if (text == null) return "";
  let s = String(text);
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/đ/g, "d").replace(/Đ/g, "d");
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  if (s.length > SLUG_MAX_LEN) {
    s = s.slice(0, SLUG_MAX_LEN).replace(/-+$/g, "");
  }
  return s;
}

/**
 * Resolve a list of vehicle applications down to the most descriptive
 * primary fitment for slug generation. Heuristic, NOT business logic:
 *
 *   - Prefer rows with the most fields populated (brand + model + year).
 *   - Tiebreaker: pick the earliest-listed row (matches the order the
 *     API already returns — usually the seller-listed primary fitment).
 *   - Fields can come from either snake_case (raw API: hang_xe / ten_xe
 *     / year_from / year_to) or camelCase (product-list shape: brand /
 *     model / yearFrom / yearTo). Both supported.
 */
function pickPrimaryCar(cars) {
  if (!Array.isArray(cars) || cars.length === 0) return null;
  const scored = cars.map((c, idx) => {
    const brand = c?.brand ?? c?.hang_xe ?? "";
    const model = c?.model ?? c?.ten_xe ?? "";
    const yFrom = c?.yearFrom ?? c?.year_from ?? null;
    const yTo = c?.yearTo ?? c?.year_to ?? null;
    let score = 0;
    if (brand && String(brand).trim()) score += 4;
    if (model && String(model).trim()) score += 2;
    if (yFrom != null && yFrom !== "") score += 1;
    return { idx, brand, model, yFrom, yTo, score };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
  return scored[0] || null;
}

/**
 * Prefer the active marketplace listing vehicle filter for slug segments.
 *
 * @param {{ brand?: string, model?: string, year?: string | number }} [listingVehicle]
 */
export function carFromListingVehicleFilter(listingVehicle) {
  if (!listingVehicle || typeof listingVehicle !== "object") return null;
  const brand = String(listingVehicle.brand || "").trim();
  const model = String(listingVehicle.model || "").trim();
  const yearRaw = listingVehicle.year;
  const y =
    yearRaw != null && String(yearRaw).trim() !== ""
      ? Number(yearRaw)
      : null;
  if (!brand && !model && !Number.isFinite(y)) return null;
  return {
    brand,
    model,
    yFrom: Number.isFinite(y) ? y : null,
    yTo: Number.isFinite(y) ? y : null,
  };
}

/**
 * Build the slug PREFIX (no id appended) from a product shape.
 *
 * Accepts a flexible input so the same builder can serve:
 *   - the raw API response (`product.partName`, `cars[0].hang_xe`, …),
 *   - the product-list/list-card shape (`item.name`, `item.brand`, …),
 *   - the home-card shape (`item.shortDescription`, …),
 *   - any partial subset; missing pieces are skipped silently.
 *
 * Returns "" if nothing usable was provided — callers should treat
 * that as "use id-only URL" and let canonical-enforce repair it.
 */
export function buildProductSeoSlug(input) {
  return buildProductSeoSlugWithMeta(input).slug;
}

/**
 * Build the full public product URL (root-level canonical).
 *
 *   buildProductSeoUrl({ id: 2913, partName: "Lọc xăng", … })
 *   → "/loc-xang-toyota-vios-2013-2330021010-2913"
 *
 * Falls back to "/p/<id>" when no slug fields are available — a
 * stable, never-collidable namespace handled by the apex router's
 * product-id detection so we never risk hitting an unrelated slug
 * (e.g. a `[id]`-only URL like "/2913" could in theory shadow a
 * non-product slug). The fallback resolves in a single 308 hop to
 * the canonical full-slug URL.
 *
 * Returns "/" if no id was provided — defensive guard against
 * undefined products (rare, but cheaper than a 404 from a half-built
 * link in the UI).
 */
export function buildProductSeoUrl(input, options = {}) {
  if (!input || typeof input !== "object") return "/";

  const allowRecovery = isMarketplaceListingNavigation();
  const recoveredContext = resolveMarketplaceContextForHref(options, {
    allowRecovery,
  });

  let vehicleContext =
    options.marketplaceContext ||
    options.listingVehicle ||
    input.marketplaceContext ||
    input.listingVehicle ||
    input.matchedFitment;

  if (
    !devHasMarketplaceContext(vehicleContext) &&
    !isEmptyMarketplaceContext(recoveredContext)
  ) {
    vehicleContext = recoveredContext;
  }

  let payload = input;
  if (
    devHasMarketplaceContext(vehicleContext) &&
    !devHasMarketplaceContext(input.marketplaceContext) &&
    !devHasMarketplaceContext(input.listingVehicle)
  ) {
    payload = {
      ...input,
      listingVehicle: vehicleContext,
      marketplaceContext: vehicleContext,
    };
  }

  const suppressUnsafeVehicleFallback =
    allowRecovery && !devHasMarketplaceContext(vehicleContext);
  if (suppressUnsafeVehicleFallback) {
    payload = { ...payload, suppressUnsafeVehicleFallback: true };
  }

  const id = payload.id ?? payload.productId ?? payload.product_id ?? null;
  if (id == null || id === "") return "/";

  devWarnMissingMarketplaceContext(payload, {
    ...options,
    marketplaceContext: devHasMarketplaceContext(vehicleContext)
      ? vehicleContext
      : options.marketplaceContext,
  });

  const slugMeta = buildProductSeoSlugWithMeta(payload);
  const slug = slugMeta.slug;
  return slug ? `/${slug}-${id}` : `/p/${id}`;
}

/**
 * Pull the canonical product id out of a /phu-tung/[slug] segment.
 *
 * Accepts both shapes:
 *   "loc-xang-toyota-vios-2013-2330021010-2913" → 2913
 *   "2913"                                       → 2913
 *
 * Returns null for any input that does not end in a positive integer
 * (callers should `notFound()` in that case).
 *
 * Performance contract: this is the hot-path parser run on every
 * product detail request. It is intentionally a single regex + Number
 * coercion with no allocations beyond the match array.
 */
export function extractProductIdFromSeoSlug(slug) {
  if (slug == null) return null;
  const s = String(slug).trim();
  if (!s) return null;
  const m = s.match(/(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

/**
 * SEO landing slugs that own apex routes. A slug equal to / starting
 * with these is NEVER treated as a product, regardless of trailing
 * digits. Keep in sync with `lib/seo/slugify.js#SEO_BASE_SLUG` (the
 * literal duplicated here to keep this module dependency-free —
 * critical since it runs inside the apex `[slug]` route discriminator
 * on every apex request).
 */
/**
 * Hard discriminator: is this apex slug a product detail URL?
 *
 * Apex `[slug]` routes share namespace with category SEO pages, vehicle
 * SEO landings, CMS slugs, and future content URLs. We can only treat
 * a slug as a product detail URL when ALL of:
 *
 *   1. Slug ends in `-<positive-integer>` with a non-empty descriptive
 *      prefix (rejects bare-id URLs like "/2913" — those route via the
 *      explicit `/p/<id>` fallback path of `buildProductSeoUrl`).
 *   2. Slug is not a known SEO landing pattern:
 *        - "phu-tung-o-to"           (root vehicle hub)
 *        - "phu-tung-o-to-<anything>" (vehicle landing branch)
 *        - "<anything>-o-to"         (category landing)
 *   3. The trailing digit run does NOT look like ONLY a year (1900-2099)
 *      when the rest of the slug has no other digits. This protects
 *      slugs like "toyota-vios-2025" (vehicle landing) from being
 *      mis-classified — a real product slug almost always carries a
 *      partNumber token (alphanumeric, contains digits) somewhere
 *      between the year and the trailing id, so the prefix containing
 *      `[0-9]` is a strong signal.
 *
 * IMPORTANT: this is a fast filter, NOT a definitive answer. The apex
 * router uses this to decide whether to attempt a product fetch; if
 * the fetch returns 404 the router falls through to the existing
 * SEO/landing logic. False positives self-heal (one failed fetch,
 * then SEO render). False negatives mean a product can be reached
 * via /product/<id> or /p/<id> but not via the heuristic — which is
 * fine because the canonical URL is built by buildProductSeoUrl
 * itself and passes this discriminator by construction.
 *
 * Pure string — no DB, no allocations beyond the regex match.
 */

/**
 * Trailing `{slug}-{id}` product pattern only — excludes listing classifier.
 * @param {string} s normalized slug
 */
function matchesProductSlugTail(s) {
  if (!s) return false;

  if (s === SEO_BASE_SLUG_LITERAL) return false;
  if (s.startsWith(`${SEO_BASE_SLUG_LITERAL}-`)) return false;
  if (s.endsWith("-o-to")) return false;

  const m = s.match(/^(.+)-(\d+)$/);
  if (!m) return false;
  const prefix = m[1];
  const idStr = m[2];

  if (idStr.startsWith("0")) return false;
  const n = Number(idStr);
  if (!Number.isFinite(n) || n <= 0) return false;

  if (/^(19|20)\d{2}$/.test(idStr) && !/[0-9]/.test(prefix)) {
    return false;
  }

  return true;
}

/** Dev-only: listing vs product classifiers must stay disjoint. */
function devAssertListingProductClassifierInvariant(slug) {
  if (!IS_DEV) return;
  const s = String(slug || "").trim();
  if (!s) return;
  if (isMarketplaceListingSlug(s) && matchesProductSlugTail(s)) {
    console.error(
      "[RouteInvariant] Marketplace listing slug overlaps product discriminator:",
      { slug: s },
    );
  }
}

export function looksLikeProductSlug(slug) {
  if (slug == null) return false;
  const s = String(slug).trim();
  if (!s) return false;

  devAssertListingProductClassifierInvariant(s);

  if (isMarketplaceListingSlug(s)) return false;

  return matchesProductSlugTail(s);
}
