import {
  isLegacyLocalThumbUrl,
  normalizeProductMediaUrl,
  rewriteLegacyThumbUrlsInHtml,
} from "./productMediaUrl";

/** Build R2 rewrite context from a seller product row or draft snapshot. */
export function sellerMediaContext(product, overrides = {}) {
  return {
    shopId:
      overrides.shopId ??
      product?.shopId ??
      product?.shop_id ??
      null,
    partNumber:
      overrides.partNumber ??
      product?.partNumber ??
      product?.part_number ??
      "",
  };
}

/** Normalize one catalog image URL for seller UI (never emit /images/thumbs/). */
export function normalizeSellerProductImageUrl(url, ctx = {}) {
  const normalized = normalizeProductMediaUrl(url, ctx);
  if (!normalized || isLegacyLocalThumbUrl(normalized)) return "";
  return normalized;
}

/** Normalize seller product_images rows for previews and list thumbs. */
export function normalizeSellerProductImages(images, ctx = {}) {
  if (!Array.isArray(images)) return [];
  return images.map((img) => {
    if (!img || typeof img !== "object") return img;
    const raw = img.url || img.image || img.ImageURL || "";
    const normalized = normalizeSellerProductImageUrl(raw, ctx);
    if (!normalized) {
      return raw && !isLegacyLocalThumbUrl(raw) ? img : { ...img, url: "" };
    }
    if (normalized === raw) return img;
    return { ...img, url: normalized };
  });
}

/** Rewrite legacy thumb `<img>` tags inside rich-text fields (read/edit only). */
export function sanitizeSellerProductHtml(html, ctx = {}) {
  if (!html || typeof html !== "string") return html || "";
  return rewriteLegacyThumbUrlsInHtml(html, ctx);
}

/** Hydrate localStorage draft snapshots without dropping seller data. */
export function normalizeSellerDraftSnapshot(draft, ctx = {}) {
  if (!draft || typeof draft !== "object") return draft;
  const mediaCtx = sellerMediaContext(null, {
    shopId: ctx.shopId,
    partNumber: ctx.partNumber ?? draft.partNumber,
  });

  return {
    ...draft,
    shortDescription:
      typeof draft.shortDescription === "string"
        ? sanitizeSellerProductHtml(draft.shortDescription, mediaCtx)
        : draft.shortDescription,
    description:
      typeof draft.description === "string"
        ? sanitizeSellerProductHtml(draft.description, mediaCtx)
        : draft.description,
    existingImages: Array.isArray(draft.existingImages)
      ? normalizeSellerProductImages(draft.existingImages, mediaCtx)
      : draft.existingImages,
  };
}

/** Optional one-shot normalization when a seller product row enters the UI. */
export function normalizeSellerProductRecord(product) {
  if (!product || typeof product !== "object") return product;
  const ctx = sellerMediaContext(product);
  return {
    ...product,
    images: normalizeSellerProductImages(product.images, ctx),
    shortDescription: sanitizeSellerProductHtml(product.shortDescription, ctx),
    fullDescription: sanitizeSellerProductHtml(product.fullDescription, ctx),
    description: sanitizeSellerProductHtml(product.description, ctx),
  };
}
