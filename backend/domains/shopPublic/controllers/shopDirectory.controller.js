import {
  getPublicShopDirectory,
  getPublicShopDirectoryBrands,
  getPublicShopDirectoryProvinces,
  getRelatedShopsBySlug,
} from "../services/shopDirectory.service.js";
import { validateShopSlugParam } from "../validators/shopPublic.validators.js";
import { shopsiteLog } from "../observability/logger.js";
import { recordPublicRequest } from "../observability/abuseDetector.js";

/**
 * Phase 7.1 — public shop directory + related-shops controller.
 *
 * Cache header strategy mirrors `shopPublic.controller.CACHE_HEADERS`:
 *   - directory list  :  60s s-maxage,  300s SWR (newest shop wants
 *                        ~minute-level surfacing for the first 24h)
 *   - related shops   : 300s s-maxage,  600s SWR (similar-shop graph
 *                        is stable; this is the most cacheable surface)
 *   - facets          : 300s s-maxage,  600s SWR
 */
const CACHE_HEADERS = Object.freeze({
  directory: "public, s-maxage=60,  stale-while-revalidate=300",
  related:   "public, s-maxage=300, stale-while-revalidate=600",
  facets:    "public, s-maxage=300, stale-while-revalidate=600",
});

function trackResponse(req, res) {
  recordPublicRequest(req, res);
}

/** GET /api/public/shops */
export async function handleListShops(req, res) {
  const t = Date.now();
  try {
    const data = await getPublicShopDirectory({
      q: req.query.q,
      brand: req.query.brand,
      provinceSlug: req.query.provinceSlug || req.query.province,
      verified: req.query.verified,
      minProducts: req.query.minProducts,
      tier: req.query.tier,
      page: req.query.page,
      perPage: req.query.perPage,
      sort: req.query.sort,
    });
    res.set("Cache-Control", CACHE_HEADERS.directory);
    res.json(data);
    shopsiteLog.info("public-api.ok", {
      route: "directory",
      total: data.total,
      page: data.page,
      sort: data.sort,
      dur_ms: Date.now() - t,
    });
    trackResponse(req, res);
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "directory",
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
    trackResponse(req, res);
  }
}

/** GET /api/public/shops/_facets/provinces */
export async function handleListProvinces(req, res) {
  const t = Date.now();
  try {
    const items = await getPublicShopDirectoryProvinces();
    res.set("Cache-Control", CACHE_HEADERS.facets);
    res.json({ items });
    shopsiteLog.info("public-api.ok", {
      route: "facets.provinces",
      count: items.length,
      dur_ms: Date.now() - t,
    });
    trackResponse(req, res);
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "facets.provinces",
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
    trackResponse(req, res);
  }
}

/** GET /api/public/shops/_facets/brands */
export async function handleListBrands(req, res) {
  const t = Date.now();
  try {
    const items = await getPublicShopDirectoryBrands();
    res.set("Cache-Control", CACHE_HEADERS.facets);
    res.json({ items });
    shopsiteLog.info("public-api.ok", {
      route: "facets.brands",
      count: items.length,
      dur_ms: Date.now() - t,
    });
    trackResponse(req, res);
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "facets.brands",
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
    trackResponse(req, res);
  }
}

/** GET /api/public/shops/:slug/related */
export async function handleListRelatedShops(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) {
    shopsiteLog.warn("public-api.unknown-shop", { slug: req.params.slug });
    res.status(404).json({ error: "Shop không tồn tại" });
    return trackResponse(req, res);
  }
  try {
    const limit = clampLimit(req.query.limit);
    const data = await getRelatedShopsBySlug(slug, { limit });
    if (!data) {
      shopsiteLog.warn("public-api.unknown-shop", { slug });
      res.status(404).json({ error: "Shop không tồn tại" });
      return trackResponse(req, res);
    }
    res.set("Cache-Control", CACHE_HEADERS.related);
    res.json(data);
    shopsiteLog.info("public-api.ok", {
      route: "related",
      slug,
      count: data.items.length,
      dur_ms: Date.now() - t,
    });
    trackResponse(req, res);
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "related",
      slug,
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
    trackResponse(req, res);
  }
}

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 6;
  return Math.min(12, Math.floor(n));
}
