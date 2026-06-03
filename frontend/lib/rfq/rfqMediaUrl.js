import { API_ORIGIN } from "@/lib/config";

/** Neutral placeholder when all RFQ media URLs fail. */
export const RFQ_IMAGE_PLACEHOLDER = "/no-image.png";

const RFQ_R2_PUBLIC_BASE = (
  process.env.NEXT_PUBLIC_RFQ_R2_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_RFQ_R2_PUBLIC_BASE_URL ||
  ""
).replace(/\/+$/, "");

const RFQ_R2_KEY_PREFIX = (
  process.env.NEXT_PUBLIC_RFQ_R2_KEY_PREFIX || "rfq"
).replace(/^\/+|\/+$/g, "");

const LEGACY_RFQ_UPLOADS_RE = /\/uploads\/rfq\/([^/?#]+)$/i;
const RFQ_R2_CATEGORIES = ["chat", "request"];
const RFQ_R2_MONTH_LOOKBACK = 12;

export const RFQ_MEDIA_VARIANT = Object.freeze({
  SMALL: "small",
  MEDIUM: "medium",
  ORIGINAL: "original",
});

/**
 * Resolve RFQ image URL for previews (create form, chat, quotes, lightbox).
 * Supports absolute R2/CDN URLs and legacy local paths (/uploads/rfq/…).
 */
export function rfqImageSrc(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_ORIGIN}${u}`;
  return `${API_ORIGIN}/${u}`;
}

/** Alias for clarity in new code paths */
export const resolveRfqMediaUrl = rfqImageSrc;

/** True when URL is already absolute (R2/CDN); false for legacy local paths */
export function isAbsoluteRfqMediaUrl(url) {
  const u = String(url || "").trim();
  return u.startsWith("http://") || u.startsWith("https://");
}

export function isLegacyLocalRfqMediaUrl(url) {
  return String(url || "").trim().startsWith("/uploads/rfq/");
}

export function isLegacyApexRfqMediaUrl(url) {
  const u = String(url || "").trim();
  if (!isAbsoluteRfqMediaUrl(u)) return false;
  return LEGACY_RFQ_UPLOADS_RE.test(u.split("?")[0]);
}

export function isRfqR2PublicMediaUrl(url) {
  const u = String(url || "").trim();
  if (!RFQ_R2_PUBLIC_BASE || !u) return false;
  return u.startsWith(`${RFQ_R2_PUBLIC_BASE}/`);
}

function extractLegacyRfqFilename(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (isLegacyLocalRfqMediaUrl(u)) return filenameFromMediaUrl(u);
  const match = u.split("?")[0].match(LEGACY_RFQ_UPLOADS_RE);
  return match?.[1]?.toLowerCase() || "";
}

/** Mirror backend read-time legacy rewrite (sync best-effort). */
export function buildPossibleRfqR2Urls(filename) {
  const fname = String(filename || "").trim().toLowerCase();
  if (
    !fname ||
    fname.startsWith("thumb_100_") ||
    fname.startsWith("thumb_400_")
  ) {
    return [];
  }
  if (!RFQ_R2_PUBLIC_BASE || !RFQ_R2_KEY_PREFIX) return [];

  const urls = [];
  const anchor = new Date();
  for (let i = 0; i < RFQ_R2_MONTH_LOOKBACK; i += 1) {
    const d = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1),
    );
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    for (const category of RFQ_R2_CATEGORIES) {
      urls.push(
        `${RFQ_R2_PUBLIC_BASE}/${RFQ_R2_KEY_PREFIX}/${category}/${year}/${month}/${fname}`,
      );
    }
  }
  return urls;
}

/** Client-side safety net when API still returns legacy paths. */
export function canonicalizeRfqMediaUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (isRfqR2PublicMediaUrl(raw)) return raw;
  if (isAbsoluteRfqMediaUrl(raw) && !isLegacyLocalRfqMediaUrl(raw) && !isLegacyApexRfqMediaUrl(raw)) {
    return raw;
  }

  const fname = extractLegacyRfqFilename(raw);
  if (!fname) return raw;

  const candidates = buildPossibleRfqR2Urls(fname);
  return candidates[0] || raw;
}

export function isRfqSidecarThumbUrl(url) {
  const fname = filenameFromMediaUrl(url);
  return (
    fname.startsWith("thumb_100_") ||
    fname.startsWith("thumb_400_")
  );
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
  if (!fname || isRfqSidecarThumbUrl(u)) {
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

function pushResolved(out, seen, raw) {
  const resolved = rfqImageSrc(raw);
  if (!resolved || seen.has(resolved)) return;
  seen.add(resolved);
  out.push(resolved);
}

function pushVariantCandidates(out, seen, candidates, explicit) {
  if (explicit) pushResolved(out, seen, explicit);
  pushResolved(out, seen, candidates?.webp);
  pushResolved(out, seen, candidates?.jpg);
}

/**
 * Phase 6C — unified RFQ media fallback chain.
 *
 * small:  thumb_100 (webp→jpg) → thumb_400 (webp→jpg) → original → placeholder
 * medium: thumb_400 (webp→jpg) → thumb_100 (webp→jpg) → original → placeholder
 * original: original → placeholder
 */
export function getRfqMediaFallbackChain(
  originalUrl,
  variant = RFQ_MEDIA_VARIANT.MEDIUM,
  explicitThumbnails = null,
) {
  const original = canonicalizeRfqMediaUrl(String(originalUrl || "").trim());
  if (!original) return [RFQ_IMAGE_PLACEHOLDER];

  const seen = new Set();
  const out = [];
  const c = deriveRfqThumbnailCandidates(original);
  const thumbs = resolveRfqThumbnails(original, explicitThumbnails);

  if (variant === RFQ_MEDIA_VARIANT.ORIGINAL || isRfqSidecarThumbUrl(original)) {
    pushResolved(out, seen, original);
    pushResolved(out, seen, RFQ_IMAGE_PLACEHOLDER);
    return out;
  }

  if (variant === RFQ_MEDIA_VARIANT.SMALL) {
    pushVariantCandidates(out, seen, c.small, thumbs.small);
    pushVariantCandidates(out, seen, c.medium, thumbs.medium);
  } else {
    pushVariantCandidates(out, seen, c.medium, thumbs.medium);
    pushVariantCandidates(out, seen, c.small, thumbs.small);
  }

  pushResolved(out, seen, original);
  pushResolved(out, seen, RFQ_IMAGE_PLACEHOLDER);
  return out;
}

/** Primary display URL — first step in the fallback chain. */
export function resolveRfqDisplayUrl(
  originalUrl,
  variant = RFQ_MEDIA_VARIANT.MEDIUM,
  explicitThumbnails = null,
) {
  const chain = getRfqMediaFallbackChain(originalUrl, variant, explicitThumbnails);
  return chain[0] || RFQ_IMAGE_PLACEHOLDER;
}

/** Fallback URLs after primary (excludes primary; includes placeholder). */
export function getRfqMediaFallbackAfterPrimary(
  originalUrl,
  variant = RFQ_MEDIA_VARIANT.MEDIUM,
  explicitThumbnails = null,
) {
  const chain = getRfqMediaFallbackChain(originalUrl, variant, explicitThumbnails);
  return chain.slice(1);
}

/**
 * @deprecated Prefer getRfqMediaFallbackAfterPrimary
 */
export function rfqThumbFallbackSrcs(originalUrl, variant, explicitThumbnails = null) {
  const v =
    variant === "small" ? RFQ_MEDIA_VARIANT.SMALL : RFQ_MEDIA_VARIANT.MEDIUM;
  return getRfqMediaFallbackAfterPrimary(originalUrl, v, explicitThumbnails);
}

/** Inbox / header — thumb_100 preferred */
export function rfqThumbSmallSrc(originalUrl, explicitThumbnails = null) {
  return resolveRfqDisplayUrl(
    originalUrl,
    RFQ_MEDIA_VARIANT.SMALL,
    explicitThumbnails,
  );
}

export function rfqThumbSmallFallbackSrcs(originalUrl, explicitThumbnails = null) {
  return getRfqMediaFallbackAfterPrimary(
    originalUrl,
    RFQ_MEDIA_VARIANT.SMALL,
    explicitThumbnails,
  );
}

/** Chat timeline — thumb_400 preferred */
export function rfqThumbMediumSrc(originalUrl, explicitThumbnails = null) {
  return resolveRfqDisplayUrl(
    originalUrl,
    RFQ_MEDIA_VARIANT.MEDIUM,
    explicitThumbnails,
  );
}

export function rfqThumbMediumFallbackSrcs(originalUrl, explicitThumbnails = null) {
  return getRfqMediaFallbackAfterPrimary(
    originalUrl,
    RFQ_MEDIA_VARIANT.MEDIUM,
    explicitThumbnails,
  );
}

/** Lightbox / full view — always original */
export function rfqOriginalSrc(originalUrl) {
  return resolveRfqDisplayUrl(originalUrl, RFQ_MEDIA_VARIANT.ORIGINAL);
}

export function rfqOriginalFallbackSrcs(originalUrl) {
  return getRfqMediaFallbackAfterPrimary(originalUrl, RFQ_MEDIA_VARIANT.ORIGINAL);
}
