import {
  findPublicShopBySlug,
  countPublicShopProducts,
  listShopCategories,
} from "../repositories/shopPublic.repository.js";
import { listShopProducts } from "../repositories/shopPublicProducts.repository.js";

/**
 * Project a raw `shops` row into the public-API DTO. Backwards-
 * compatible field names align with the Phase 1 hardcoded
 * `frontend/data/shop-demo.js` so the frontend swap is mechanical.
 */
function toPublicDto(row, extras = {}) {
  if (!row) return null;
  const phone = row.phone || "";
  const zalo = row.zalo || row.phone || "";
  const facebookUrl = row.facebook_url || null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.bio || stripHtmlOneLine(row.descriptionHtml, 160),
    verified: !!row.verified_at,
    avatar: row.avatar || null,
    cover: row.cover || null,

    phone,
    zalo,
    email: row.email || null,
    facebook: facebookUrl
      ? { label: prettyFacebookLabel(facebookUrl), url: facebookUrl }
      : null,
    website: row.website || null,

    address: row.addressDetail || null,
    provinceId: row.provinceId || null,
    province: row.provinceLabel || null,

    workingHoursShort: row.working_hours || null,
    workingHoursLines: splitWorkingHoursLines(row.working_hours),

    introHtml: row.intro_html || row.descriptionHtml || null,
    salePolicyHtml: row.salePolicy || null,
    warrantyPolicyHtml: row.warrantyPolicy || null,

    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    mapEmbedUrl: row.map_embed_url || null,

    verifiedAt: row.verified_at || null,
    publishedAt: row.published_at || null,
    createdAt: row.createdAt || null,

    productCount: extras.productCount ?? null,
  };
}

function stripHtmlOneLine(html, limit = 160) {
  if (!html) return null;
  const txt = String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!txt) return null;
  return txt.length > limit ? `${txt.slice(0, limit - 1)}…` : txt;
}

function prettyFacebookLabel(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

function splitWorkingHoursLines(value) {
  if (!value) return [];
  return String(value)
    .split(/\r?\n|\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve slug → enriched public shop DTO (with product count).
 * Returns null when the shop is missing OR not in `public` status.
 */
export async function getPublicShopBySlug(slug) {
  const row = await findPublicShopBySlug(slug);
  if (!row) return null;
  const productCount = await countPublicShopProducts(row.id);
  return toPublicDto(row, { productCount });
}

/**
 * Resolve slug → list of categories (with product counts).
 */
export async function getPublicShopCategories(slug) {
  const row = await findPublicShopBySlug(slug);
  if (!row) return null;
  const categories = await listShopCategories(row.id);
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    productCount: Number(c.productCount) || 0,
  }));
}

/**
 * Resolve slug → paginated products (with filter/sort).
 */
export async function getPublicShopProducts(slug, query = {}) {
  const row = await findPublicShopBySlug(slug);
  if (!row) return null;
  const data = await listShopProducts({
    shopId: row.id,
    page: query.page,
    perPage: query.perPage,
    q: query.q,
    categorySlug: query.category,
    brand: query.brand,
    model: query.model,
    sort: query.sort,
  });
  return {
    shop: { id: row.id, slug: row.slug, name: row.name },
    ...data,
    items: data.items.map((p) => ({
      id: p.id,
      productId: p.id,
      name: p.partName,
      partNumber: p.partNumber,
      price: p.price != null ? Number(p.price) : null,
      image: p.image_url || null,
      category: p.categoryLabel || null,
      brand: p.brandLabel || null,
      createdAt: p.createdAt || null,
    })),
  };
}

/**
 * Resolve slug → contact-only payload (subset of getPublicShopBySlug).
 */
export async function getPublicShopContact(slug) {
  const dto = await getPublicShopBySlug(slug);
  if (!dto) return null;
  return {
    slug: dto.slug,
    name: dto.name,
    phone: dto.phone,
    zalo: dto.zalo,
    email: dto.email,
    facebook: dto.facebook,
    website: dto.website,
    address: dto.address,
    province: dto.province,
    workingHoursShort: dto.workingHoursShort,
    workingHoursLines: dto.workingHoursLines,
    lat: dto.lat,
    lng: dto.lng,
    mapEmbedUrl: dto.mapEmbedUrl,
  };
}
