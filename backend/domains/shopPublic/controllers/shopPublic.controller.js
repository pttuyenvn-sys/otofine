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

const CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=300";

/** GET /api/public/shops/:slug */
export async function handleGetShop(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(res, { slug: req.params.slug });
  try {
    const data = await getPublicShopBySlug(slug);
    if (!data) return notFound(res, { slug });
    res.set("Cache-Control", CACHE_HEADER);
    res.json(data);
    shopsiteLog.info("public-api.ok", { route: "shop", slug, dur_ms: Date.now() - t });
  } catch (err) {
    shopsiteLog.error("public-api.error", { route: "shop", slug, msg: err?.message || "err" });
    res.status(500).json({ error: "Internal server error" });
  }
}

/** GET /api/public/shops/:slug/products */
export async function handleGetShopProducts(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(res, { slug: req.params.slug });
  try {
    const query = validateProductsQuery(req.query);
    const data = await getPublicShopProducts(slug, query);
    if (!data) return notFound(res, { slug });
    res.set("Cache-Control", CACHE_HEADER);
    res.json(data);
    shopsiteLog.info("public-api.ok", {
      route: "products",
      slug,
      page: query.page,
      dur_ms: Date.now() - t,
    });
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "products",
      slug,
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

/** GET /api/public/shops/:slug/categories */
export async function handleGetShopCategories(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(res, { slug: req.params.slug });
  try {
    const data = await getPublicShopCategories(slug);
    if (!data) return notFound(res, { slug });
    res.set("Cache-Control", CACHE_HEADER);
    res.json({ items: data });
    shopsiteLog.info("public-api.ok", {
      route: "categories",
      slug,
      count: data.length,
      dur_ms: Date.now() - t,
    });
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "categories",
      slug,
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

/** GET /api/public/shops/:slug/fitments */
export async function handleGetShopFitments(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(res, { slug: req.params.slug });
  try {
    const data = await getPublicShopFitments(slug);
    if (!data) return notFound(res, { slug });
    res.set("Cache-Control", CACHE_HEADER);
    res.json(data);
    shopsiteLog.info("public-api.ok", {
      route: "fitments",
      slug,
      brands: data.brands?.length || 0,
      dur_ms: Date.now() - t,
    });
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "fitments",
      slug,
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

/** GET /api/public/shops/:slug/contact */
export async function handleGetShopContact(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(res, { slug: req.params.slug });
  try {
    const data = await getPublicShopContact(slug);
    if (!data) return notFound(res, { slug });
    res.set("Cache-Control", CACHE_HEADER);
    res.json(data);
    shopsiteLog.info("public-api.ok", { route: "contact", slug, dur_ms: Date.now() - t });
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "contact",
      slug,
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

function notFound(res, ctx) {
  // Identical shape & status for "missing slug", "invalid slug",
  // "shop exists but not public". Prevents enumeration.
  shopsiteLog.warn("public-api.unknown-shop", { slug: ctx?.slug ?? "-" });
  return res.status(404).json({ error: "Shop không tồn tại" });
}
