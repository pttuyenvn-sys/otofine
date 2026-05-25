import {
  getPublicShopBySlug,
  getPublicShopCategories,
  getPublicShopContact,
  getPublicShopFitments,
  getPublicShopProducts,
} from "../services/shopPublic.service.js";
import {
  validateProductsQuery,
  validateShopSlugParam,
} from "../validators/shopPublic.validators.js";
import { shopsiteLog } from "../observability/logger.js";
import { recordPublicRequest } from "../observability/abuseDetector.js";
import { publicShopConfig } from "../config/publicShop.config.js";

/**
 * Phase 6A — per-process memoised set of "we already logged that
 * <slug> is awaiting subdomain rollout". Keeps the log signal alive
 * (one line per slug per restart) without flooding.
 */
const _allowlistPendingLogged = new Set();
function maybeLogAllowlistPending(slug) {
  if (!slug) return;
  if (!publicShopConfig.allowlist.enabled) return;
  if (publicShopConfig.isSlugAllowed(slug)) return;
  if (_allowlistPendingLogged.has(slug)) return;
  _allowlistPendingLogged.add(slug);
  shopsiteLog.info("storefront.subdomain-pending", { slug });
}

/**
 * Per-route Cache-Control header sent downstream to the CDN / shared
 * caches (Cloudflare, Nginx micro-cache, browser proxies).
 *
 * `s-maxage` controls the SHARED cache TTL; `stale-while-revalidate`
 * lets a CDN keep serving the stale copy for N more seconds while it
 * fetches a fresh one in the background — no user ever waits on a
 * cold origin request.
 *
 * We never set `max-age` (the BROWSER cache) here. Browsers should
 * always re-validate so a logged-in seller publishing a fix sees it
 * on next nav. The shared cache is the win.
 *
 * Tuning rationale per route:
 *   - shop     :  60s — needs fast propagation of "I just toggled
 *                 to public" / "I just changed my cover".
 *   - contact  : 300s — contact rarely changes hour-to-hour.
 *   - products :  30s — newest product wants to surface fast.
 *   - categories/fitments : 300s — taxonomy churns by weeks.
 *
 * The seller's PUT endpoint already invalidates the in-memory cache;
 * a CDN will pick up the new version on its next stale-while-revalidate
 * fetch, which for `shopInfo` is within ~60s + SWR.
 */
const CACHE_HEADERS = Object.freeze({
  shop:       "public, s-maxage=60,  stale-while-revalidate=300",
  contact:    "public, s-maxage=300, stale-while-revalidate=600",
  products:   "public, s-maxage=30,  stale-while-revalidate=120",
  categories: "public, s-maxage=300, stale-while-revalidate=600",
  fitments:   "public, s-maxage=300, stale-while-revalidate=600",
});

/**
 * Fire-and-forget observability hook. Runs AFTER the response is
 * already flushed so it can never affect latency or error paths.
 *
 * Both the rate-limited 429 and the 404 path pass through here so
 * the abuse detector sees every status code, not just 200s.
 */
function trackResponse(req, res) {
  recordPublicRequest(req, res);
}

/** GET /api/public/shops/:slug */
export async function handleGetShop(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(req, res, { slug: req.params.slug });
  try {
    const data = await getPublicShopBySlug(slug);
    if (!data) return notFound(req, res, { slug });
    maybeLogAllowlistPending(slug);
    res.set("Cache-Control", CACHE_HEADERS.shop);
    res.json(data);
    shopsiteLog.info("public-api.ok", { route: "shop", slug, dur_ms: Date.now() - t });
    trackResponse(req, res);
  } catch (err) {
    shopsiteLog.error("public-api.error", { route: "shop", slug, msg: err?.message || "err" });
    res.status(500).json({ error: "Internal server error" });
    trackResponse(req, res);
  }
}

/** GET /api/public/shops/:slug/products */
export async function handleGetShopProducts(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(req, res, { slug: req.params.slug });
  try {
    const query = validateProductsQuery(req.query);
    const data = await getPublicShopProducts(slug, query);
    if (!data) return notFound(req, res, { slug });
    res.set("Cache-Control", CACHE_HEADERS.products);
    res.json(data);
    shopsiteLog.info("public-api.ok", {
      route: "products",
      slug,
      page: query.page,
      dur_ms: Date.now() - t,
    });
    trackResponse(req, res);
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "products",
      slug,
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
    trackResponse(req, res);
  }
}

/** GET /api/public/shops/:slug/categories */
export async function handleGetShopCategories(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(req, res, { slug: req.params.slug });
  try {
    const data = await getPublicShopCategories(slug);
    if (!data) return notFound(req, res, { slug });
    res.set("Cache-Control", CACHE_HEADERS.categories);
    res.json({ items: data });
    shopsiteLog.info("public-api.ok", {
      route: "categories",
      slug,
      count: data.length,
      dur_ms: Date.now() - t,
    });
    trackResponse(req, res);
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "categories",
      slug,
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
    trackResponse(req, res);
  }
}

/** GET /api/public/shops/:slug/fitments */
export async function handleGetShopFitments(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(req, res, { slug: req.params.slug });
  try {
    const data = await getPublicShopFitments(slug);
    if (!data) return notFound(req, res, { slug });
    res.set("Cache-Control", CACHE_HEADERS.fitments);
    res.json(data);
    shopsiteLog.info("public-api.ok", {
      route: "fitments",
      slug,
      brands: data.brands?.length || 0,
      dur_ms: Date.now() - t,
    });
    trackResponse(req, res);
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "fitments",
      slug,
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
    trackResponse(req, res);
  }
}

/** GET /api/public/shops/:slug/contact */
export async function handleGetShopContact(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(req, res, { slug: req.params.slug });
  try {
    const data = await getPublicShopContact(slug);
    if (!data) return notFound(req, res, { slug });
    res.set("Cache-Control", CACHE_HEADERS.contact);
    res.json(data);
    shopsiteLog.info("public-api.ok", { route: "contact", slug, dur_ms: Date.now() - t });
    trackResponse(req, res);
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "contact",
      slug,
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
    trackResponse(req, res);
  }
}

function notFound(req, res, ctx) {
  // Identical shape & status for "missing slug", "invalid slug",
  // "shop exists but not public". Prevents enumeration.
  shopsiteLog.warn("public-api.unknown-shop", { slug: ctx?.slug ?? "-" });
  res.status(404).json({ error: "Shop không tồn tại" });
  trackResponse(req, res);
}
