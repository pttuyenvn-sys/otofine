import {
  findOwnedShop,
  findShopIdBySlug,
  updatePublicPageConfig,
  updateShopAvatar,
  updateShopCover,
} from "../repositories/sellerPublicPage.repository.js";
import {
  buildUpdatePayload,
  fromDbStatus,
  validateSlugAvailabilityQuery,
  validateSlugForUpdate,
} from "../validators/sellerPublicPage.validators.js";
import { resolveShopZalo } from "../../../utils/resolveShopZalo.js";

const FRONTEND_BASE =
  process.env.FRONTEND_URL?.replace(/\/$/, "") || "https://otofine.com";

function apexHost() {
  try {
    return new URL(FRONTEND_BASE).hostname.replace(/^www\./, "");
  } catch {
    return "otofine.com";
  }
}

function buildPreviewUrl(slug, publicStatus) {
  if (!slug) return null;
  const previewBase = `https://${slug}.${apexHost()}`;
  return {
    subdomain: previewBase,
    apex: `${FRONTEND_BASE}/shops/${slug}`,
    isLive: publicStatus === "public",
  };
}

/** Project a raw shop row into the seller-facing DTO. */
function toSellerDto(row) {
  if (!row) return null;
  const sellerStatus = fromDbStatus(row.public_status);
  return {
    shopId: row.id,
    name: row.name,
    slug: row.slug,
    publicStatus: sellerStatus,
    bio: row.bio,
    introHtml: row.intro_html,
    avatar: row.avatar,
    coverImage: row.cover_image || row.cover,
    phone: row.phone,
    email: row.email,
    // Bug-fix Phase A.1: seller-facing DTO MUST reflect the same value
    // the storefront renders. Use the canonical helper so the "Zalo
    // phone" field in the public-page tab on /shop/settings mirrors
    // whatever the Basic tab just saved.
    zaloPhone: resolveShopZalo(row),
    facebookUrl: row.facebook_url,
    website: row.website,
    addressDetail: row.addressDetail,
    workingHours: row.working_hours,
    mapEmbedUrl: row.map_embed_url,
    verifiedAt: row.verified_at,
    publishedAt: row.published_at,
    // Optional self-declared "operating since" year — surfaced so the
    // /shop/settings form can pre-fill the input. NULL → frontend
    // renders an empty placeholder and the storefront falls back to
    // `createdAt` for the "X+ năm" derivation.
    foundedYear: row.founded_year != null ? Number(row.founded_year) : null,
    preview: buildPreviewUrl(row.slug, sellerStatus),
  };
}

export async function getMyPublicPage(shopId) {
  const row = await findOwnedShop(shopId);
  return toSellerDto(row);
}

export async function checkSlugAvailability(shopId, rawSlug) {
  const validation = validateSlugAvailabilityQuery(rawSlug);
  if (!validation.ok) {
    return { available: false, ...validation };
  }
  const owner = await findShopIdBySlug(validation.slug);
  if (owner != null && owner !== shopId) {
    return {
      available: false,
      ok: false,
      code: "TAKEN",
      error: "Slug này đã được shop khác sử dụng",
      slug: validation.slug,
    };
  }
  return {
    available: true,
    ok: true,
    slug: validation.slug,
    mine: owner === shopId,
  };
}

export async function updateMyPublicPage(shopId, body) {
  const { data, errors } = buildUpdatePayload(body || {});

  if (data._slugCandidate !== undefined) {
    const slugCandidate = data._slugCandidate;
    delete data._slugCandidate;
    const owner = await findShopIdBySlug(slugCandidate);
    const result = validateSlugForUpdate(slugCandidate, shopId, owner);
    if (!result.ok) {
      errors.push({ field: "slug", message: result.error, code: result.code });
    } else {
      data.slug = result.slug;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Bug-fix Phase A.1: bidirectional zalo↔zalo_phone mirror, mirror
  // image of the legacy /api/shop/me write path. Whenever the storefront
  // tab saves `zalo_phone`, we ALSO overwrite the canonical `zalo`
  // column so RFQ services + legacy `/api/shop/me` consumers see the
  // same value. Mirror is computed here rather than in the validator
  // so the column-allowlist in the validator stays narrow.
  if (Object.prototype.hasOwnProperty.call(data, "zalo_phone")) {
    const raw = data.zalo_phone;
    const normalized =
      raw == null || String(raw).trim() === "" ? null : String(raw).trim();
    data.zalo_phone = normalized;
    data.zalo = normalized;
  }

  await updatePublicPageConfig(shopId, data);
  const fresh = await findOwnedShop(shopId);
  return { ok: true, data: toSellerDto(fresh) };
}

export async function saveAvatar(shopId, url) {
  await updateShopAvatar(shopId, url);
  // Re-read the row so callers can grab the slug for cache invalidation
  // without having to plumb it through `req.shop` (which is set by an
  // auth-domain middleware we deliberately don't touch).
  const fresh = await findOwnedShop(shopId);
  return { ok: true, avatar: url, slug: fresh?.slug || null };
}

export async function saveCover(shopId, url) {
  await updateShopCover(shopId, url);
  const fresh = await findOwnedShop(shopId);
  return { ok: true, coverImage: url, slug: fresh?.slug || null };
}
