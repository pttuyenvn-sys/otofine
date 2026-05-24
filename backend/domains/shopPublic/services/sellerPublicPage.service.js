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
    zaloPhone: row.zalo_phone || row.zalo,
    facebookUrl: row.facebook_url,
    website: row.website,
    addressDetail: row.addressDetail,
    workingHours: row.working_hours,
    mapEmbedUrl: row.map_embed_url,
    verifiedAt: row.verified_at,
    publishedAt: row.published_at,
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

  await updatePublicPageConfig(shopId, data);
  const fresh = await findOwnedShop(shopId);
  return { ok: true, data: toSellerDto(fresh) };
}

export async function saveAvatar(shopId, url) {
  await updateShopAvatar(shopId, url);
  return { ok: true, avatar: url };
}

export async function saveCover(shopId, url) {
  await updateShopCover(shopId, url);
  return { ok: true, coverImage: url };
}
