import { API_ORIGIN } from "@/lib/config";

/**
 * Resolve RFQ image URL for previews (create form, chat, quotes, lightbox).
 * Supports absolute R2/CDN URLs and legacy local paths (/uploads/rfq/…).
 */
export function rfqImageSrc(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `${API_ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`;
}

/** Alias for clarity in new code paths */
export const resolveRfqMediaUrl = rfqImageSrc;

/** True when URL is already absolute (R2/CDN); false for legacy local paths */
export function isAbsoluteRfqMediaUrl(url) {
  const u = String(url || "").trim();
  return u.startsWith("http://") || u.startsWith("https://");
}

function filenameFromMediaUrl(url) {
  return String(url || "").split("/").pop()?.split("?")[0]?.toLowerCase() || "";
}

function rfqMediaFilenameStem(filename) {
  const base = String(filename || "")
    .replace(/^\/+/, "")
    .split("/")
    .pop()
    ?.split("?")[0] || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base;
  return base.slice(0, dot);
}

const EMPTY_CANDIDATES = {
  medium: { webp: null, jpg: null },
  small: { webp: null, jpg: null },
};

/**
 * Dual-era thumbnail candidates (matches backend rfqImageUrls.js).
 */
export function deriveRfqThumbnailCandidates(originalUrl) {
  const u = String(originalUrl || "").trim();
  if (!u) return { ...EMPTY_CANDIDATES };

  const fname = filenameFromMediaUrl(u);
  if (!fname || fname.startsWith("thumb_100_") || fname.startsWith("thumb_400_")) {
    return { ...EMPTY_CANDIDATES };
  }

  const lastSlash = u.lastIndexOf("/");
  const dir = lastSlash >= 0 ? u.slice(0, lastSlash + 1) : "";
  const stem = rfqMediaFilenameStem(fname);

  return {
    medium: {
      webp: `${dir}thumb_400_${stem}.webp`,
      jpg: `${dir}thumb_400_${fname}`,
    },
    small: {
      webp: `${dir}thumb_100_${stem}.webp`,
      jpg: `${dir}thumb_100_${fname}`,
    },
  };
}

/** Preferred derive — WebP first, JPEG fallback. */
export function deriveRfqThumbnailUrls(originalUrl) {
  const c = deriveRfqThumbnailCandidates(originalUrl);
  return {
    medium: c.medium.webp || c.medium.jpg || null,
    small: c.small.webp || c.small.jpg || null,
  };
}

function preferredVariantUrl(candidates, explicit) {
  const ex = String(explicit || "").trim();
  if (ex) return ex;
  return candidates?.webp || candidates?.jpg || null;
}

/** Resolve thumbnail set from attachment or URL string. */
export function resolveRfqThumbnails(originalUrl, explicit = null) {
  const c = deriveRfqThumbnailCandidates(originalUrl);
  return {
    small: preferredVariantUrl(c.small, explicit?.small),
    medium: preferredVariantUrl(c.medium, explicit?.medium),
  };
}

function isWebpUrl(url) {
  return String(url || "").toLowerCase().includes(".webp");
}

/**
 * Ordered fallback URLs after primary thumb fails: jpg thumb → original.
 * Skips duplicates; only includes jpg step when primary is WebP.
 */
export function rfqThumbFallbackSrcs(originalUrl, variant, explicitThumbnails = null) {
  const c = deriveRfqThumbnailCandidates(originalUrl);
  const bucket = variant === "medium" ? c.medium : c.small;
  const explicit =
    variant === "medium" ? explicitThumbnails?.medium : explicitThumbnails?.small;
  const primaryRaw = preferredVariantUrl(bucket, explicit);
  const primaryResolved = rfqImageSrc(primaryRaw);

  const out = [];
  const push = (raw) => {
    const resolved = rfqImageSrc(raw);
    if (resolved && resolved !== primaryResolved && !out.includes(resolved)) {
      out.push(resolved);
    }
  };

  if (isWebpUrl(primaryRaw)) {
    push(bucket.jpg);
  }
  push(originalUrl);
  return out;
}

/** Inbox / header — thumb_100 (WebP preferred) */
export function rfqThumbSmallSrc(originalUrl, explicitThumbnails = null) {
  const thumbs = resolveRfqThumbnails(originalUrl, explicitThumbnails);
  return thumbs.small ? rfqImageSrc(thumbs.small) : rfqImageSrc(originalUrl);
}

export function rfqThumbSmallFallbackSrcs(originalUrl, explicitThumbnails = null) {
  return rfqThumbFallbackSrcs(originalUrl, "small", explicitThumbnails);
}

/** Chat timeline — thumb_400 (WebP preferred) */
export function rfqThumbMediumSrc(originalUrl, explicitThumbnails = null) {
  const thumbs = resolveRfqThumbnails(originalUrl, explicitThumbnails);
  return thumbs.medium ? rfqImageSrc(thumbs.medium) : rfqImageSrc(originalUrl);
}

export function rfqThumbMediumFallbackSrcs(originalUrl, explicitThumbnails = null) {
  return rfqThumbFallbackSrcs(originalUrl, "medium", explicitThumbnails);
}

/** Lightbox / full view — always original */
export function rfqOriginalSrc(originalUrl) {
  return rfqImageSrc(originalUrl);
}
