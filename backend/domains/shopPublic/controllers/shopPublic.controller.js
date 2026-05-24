import {
  getPublicShopBySlug,
  getPublicShopCategories,
  getPublicShopContact,
  getPublicShopProducts,
} from "../services/shopPublic.service.js";
import {
  validateProductsQuery,
  validateShopSlugParam,
} from "../validators/shopPublic.validators.js";

const CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=300";

/** GET /api/public/shops/:slug */
export async function handleGetShop(req, res) {
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(res);
  try {
    const data = await getPublicShopBySlug(slug);
    if (!data) return notFound(res);
    res.set("Cache-Control", CACHE_HEADER);
    res.json(data);
  } catch (err) {
    console.error("[publicShop] handleGetShop error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/** GET /api/public/shops/:slug/products */
export async function handleGetShopProducts(req, res) {
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(res);
  try {
    const query = validateProductsQuery(req.query);
    const data = await getPublicShopProducts(slug, query);
    if (!data) return notFound(res);
    res.set("Cache-Control", CACHE_HEADER);
    res.json(data);
  } catch (err) {
    console.error("[publicShop] handleGetShopProducts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/** GET /api/public/shops/:slug/categories */
export async function handleGetShopCategories(req, res) {
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(res);
  try {
    const data = await getPublicShopCategories(slug);
    if (!data) return notFound(res);
    res.set("Cache-Control", CACHE_HEADER);
    res.json({ items: data });
  } catch (err) {
    console.error("[publicShop] handleGetShopCategories error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/** GET /api/public/shops/:slug/contact */
export async function handleGetShopContact(req, res) {
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) return notFound(res);
  try {
    const data = await getPublicShopContact(slug);
    if (!data) return notFound(res);
    res.set("Cache-Control", CACHE_HEADER);
    res.json(data);
  } catch (err) {
    console.error("[publicShop] handleGetShopContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

function notFound(res) {
  // Identical shape & status for "missing slug", "invalid slug",
  // "shop exists but not public". Prevents enumeration.
  return res.status(404).json({ error: "Shop không tồn tại" });
}
