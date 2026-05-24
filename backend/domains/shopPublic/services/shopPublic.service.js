import {
  findPublicShopBySlug,
  countPublicShopProducts,
  listShopCategories,
  listShopTopBrands,
} from "../repositories/shopPublic.repository.js";
import {
  listShopProducts,
  listShopFitmentOptions,
} from "../repositories/shopPublicProducts.repository.js";

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

    /**
     * Trust signals — additive only. Frontend may consume any subset.
     * Phase 5.1: powers the trust-badge strip + storefront completion
     * scoring without changing the legacy DTO contract.
     */
    trust: {
      verified: !!row.verified_at,
      // Whole-year tenure, computed from `published_at` if the shop
      // has actually gone live, else `createdAt`. Floor to integer; a
      // brand-new shop returns 0 → frontend hides the "Hoạt động X năm"
      // chip.
      establishedYears: yearsSince(row.published_at || row.createdAt),
      // Heuristic "responsive" signal: shop has both phone *and* a
      // direct messaging channel (zalo or facebook). Cheap proxy until
      // we have a real response-time SLO.
      quickResponse: Boolean(
        (row.phone && (row.zalo_phone || row.zalo)) ||
          (row.phone && row.facebook_url),
      ),
      topBrands: extras.topBrands || [],
    },
  };
}

function yearsSince(dateLike) {
  if (!dateLike) return 0;
  const t = new Date(dateLike).getTime();
  if (!Number.isFinite(t)) return 0;
  const ms = Date.now() - t;
  if (ms <= 0) return 0;
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
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
 *
 * The shop row lookup AND the product count are now fetched in
 * parallel — count is independent of any field on `row` (it only
 * needs `row.id`, which we then need anyway). We resolve both via
 * `findPublicShopBySlug` (cached) + a fresh count.
 */
export async function getPublicShopBySlug(slug) {
  const row = await findPublicShopBySlug(slug);
  if (!row) return null;
  // Both queries are independent of each other and only depend on
  // `row.id` — fan them out in parallel so the trust-badge data
  // doesn't add a serial round-trip.
  const [productCount, topBrands] = await Promise.all([
    countPublicShopProducts(row.id),
    listShopTopBrands(row.id, 3),
  ]);
  return toPublicDto(row, { productCount, topBrands });
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
 * The shop-row lookup and the (independent) products query are NOT
 * parallelizable here because `listShopProducts` needs the resolved
 * shop id; we do parallelize total + items inside `listShopProducts`.
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
    year: query.year,
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
      // Canonical "loại hàng" sourced from the parts knowledge base
      // (e.g. "Phớt trục số", "Máy phát điện", "Van không tải"). The
      // legacy `category_name` is often a Title-Case clone of `partName`
      // for seed data, so the card prefers `partType` when present.
      partType: p.partTypeLabel || null,
      // Raw `origin` string (e.g. "OEM", "Chính hãng", "Aftermarket")
      // surfaced for the product card's trust-badge derivation. Kept
      // as a free-form string so existing seller workflows don't need
      // to migrate to an enum.
      origin: p.origin || null,
      brand: p.brandLabel || null,
      // Phase polish: surface model + year range so the card can show
      // "Toyota • Vios • 2018-2021". Nulls are normalised so the
      // frontend can do a single `if (brand || model || year)` check.
      model: p.modelLabel || null,
      yearFrom: numOrNull(p.yearFromFirst),
      yearTo: numOrNull(p.yearToFirst),
      createdAt: p.createdAt || null,
    })),
  };
}

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve slug → fitment dropdown options (brands, models per brand,
 * year range). Returns null for unknown / not-public slugs.
 */
export async function getPublicShopFitments(slug) {
  const row = await findPublicShopBySlug(slug);
  if (!row) return null;
  return listShopFitmentOptions(row.id);
}

/**
 * Resolve slug → contact-only payload.
 *
 * Phase 4.5 perf change: we used to call `getPublicShopBySlug` which
 * additionally ran `countPublicShopProducts` — completely unused on
 * the contact endpoint. We now go straight to the cached row and
 * project a contact DTO, saving one COUNT(*) per call (and avoiding
 * a redundant product table scan when the shop has many products).
 */
export async function getPublicShopContact(slug) {
  const row = await findPublicShopBySlug(slug);
  if (!row) return null;
  const dto = toPublicDto(row, { productCount: null });
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
