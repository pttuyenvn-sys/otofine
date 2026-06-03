import { API_ORIGIN } from "@/lib/config";

/** Product catalog image variants (R2 sidecar naming matches backend thumbnail.service). */
export const PRODUCT_IMAGE_VARIANT = {
  ORIGINAL: "original",
  THUMB_100: "thumb_100",
  THUMB_400: "thumb_400",
};

export const PRODUCT_IMAGE_PLACEHOLDER = "/no-image.png";

/** Legacy filesystem thumb paths from pre-R2 catalog imports. */
export const LEGACY_PRODUCT_THUMB_PATH = "/images/thumbs/";

const LEGACY_THUMB_PATH_RE = /\/images\/thumbs\//i;

const PRODUCT_R2_PUBLIC_BASE = (
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://img.otofine.com"
).replace(/\/+$/, "");

/** Build-time flag — reserved for gradual rollout; thumb variants always derive URLs. */
export function isProductThumbnailsEnabled() {
  return process.env.NEXT_PUBLIC_PRODUCT_THUMBS_ENABLED === "1";
}

function trimUrl(raw) {
  const u = String(raw ?? "").trim();
  if (!u || u === "undefined" || u === "null") return "";
  return u;
}

export function isLegacyLocalThumbUrl(url) {
  const u = trimUrl(url).split("?")[0];
  return Boolean(u && LEGACY_THUMB_PATH_RE.test(u));
}

/** Legacy filename: 0052226_96210A9000SWP.png → part number after first underscore. */
export function extractPartNumberFromLegacyThumbUrl(url) {
  const fname = String(url || "")
    .split("/")
    .pop()
    ?.split("?")[0] || "";
  const match = fname.match(/^[0-9]+_(.+)\.[a-z0-9]+$/i);
  return match?.[1]?.trim() || "";
}

export function buildR2ProductOriginalUrl({ shopId, partNumber }) {
  const pn = String(partNumber || "")
    .trim()
    .toUpperCase();
  const sid = Number(shopId);
  if (!pn || !Number.isFinite(sid) || sid <= 0) return "";
  return `${PRODUCT_R2_PUBLIC_BASE}/shops/${sid}/${pn}.webp`;
}

/**
 * Rewrite a legacy thumb URL to canonical R2 original, or "" to block broken paths.
 * @param {string} url
 * @param {{ shopId?: number|string, partNumber?: string }} [ctx]
 */
export function resolveLegacyThumbToOriginal(url, ctx = {}) {
  if (!isLegacyLocalThumbUrl(url)) return trimUrl(url).split("?")[0];

  const partNumber =
    String(ctx.partNumber || "").trim() ||
    extractPartNumberFromLegacyThumbUrl(url);
  return (
    buildR2ProductOriginalUrl({
      shopId: ctx.shopId,
      partNumber,
    }) || ""
  );
}

/** Rewrite legacy `<img src="…/images/thumbs/…">` tags in rich HTML. */
export function rewriteLegacyThumbUrlsInHtml(html, ctx = {}) {
  const raw = String(html ?? "");
  if (!raw || !LEGACY_THUMB_PATH_RE.test(raw)) return raw;

  return raw.replace(
    /(<img\b[^>]*\bsrc\s*=\s*)(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi,
    (full, prefix, d1, d2, d3) => {
      const src = d1 || d2 || d3 || "";
      if (!isLegacyLocalThumbUrl(src)) return full;
      const resolved = resolveLegacyThumbToOriginal(src, ctx);
      if (!resolved) return full;
      if (d1 !== undefined) return `${prefix}"${resolved}"`;
      if (d2 !== undefined) return `${prefix}'${resolved}'`;
      return `${prefix}${resolved}`;
    },
  );
}

/**
 * Normalize to absolute URL without query string.
 * Never returns broken legacy `/images/thumbs/` paths.
 * @param {string} url
 * @param {{ shopId?: number|string, partNumber?: string }} [ctx]
 */
export function normalizeProductMediaUrl(url, ctx = {}) {
  const u = trimUrl(url);
  if (!u) return "";

  if (isLegacyLocalThumbUrl(u)) {
    return resolveLegacyThumbToOriginal(u, ctx);
  }

  const stripped = u.split("?")[0];
  if (stripped.startsWith("http://") || stripped.startsWith("https://")) {
    return stripped;
  }
  if (stripped.startsWith("/")) {
    if (isLegacyLocalThumbUrl(stripped)) {
      return resolveLegacyThumbToOriginal(stripped, ctx);
    }
    return stripped;
  }
  return `${API_ORIGIN}${stripped.startsWith("/") ? "" : "/"}${stripped}`;
}

function filenameFromMediaUrl(url) {
  return String(url || "").split("/").pop()?.split("?")[0] || "";
}

function productMediaFilenameStem(filename) {
  const base = String(filename || "")
    .replace(/^\/+/, "")
    .split("/")
    .pop()
    ?.split("?")[0] || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base;
  return base.slice(0, dot);
}

export function isProductThumbMediaUrl(url) {
  const fname = filenameFromMediaUrl(url).toLowerCase();
  return fname.startsWith("thumb_100_") || fname.startsWith("thumb_400_");
}

/**
 * Sidecar candidates: shops/2/ZALO.webp → thumb_100_ZALO.webp / thumb_400_ZALO.webp
 * @param {string} originalUrl
 * @param {{ shopId?: number|string, partNumber?: string }} [ctx]
 */
export function deriveProductThumbnailCandidates(originalUrl, ctx = {}) {
  const u = normalizeProductMediaUrl(originalUrl, ctx);
  if (!u) {
    return { [PRODUCT_IMAGE_VARIANT.THUMB_100]: null, [PRODUCT_IMAGE_VARIANT.THUMB_400]: null };
  }

  const fname = filenameFromMediaUrl(u);
  const fnameLower = fname.toLowerCase();
  if (
    !fname ||
    fnameLower.startsWith("thumb_100_") ||
    fnameLower.startsWith("thumb_400_")
  ) {
    return { [PRODUCT_IMAGE_VARIANT.THUMB_100]: null, [PRODUCT_IMAGE_VARIANT.THUMB_400]: null };
  }

  const lastSlash = u.lastIndexOf("/");
  const dir = lastSlash >= 0 ? u.slice(0, lastSlash + 1) : "";
  const stem = productMediaFilenameStem(fname);

  return {
    [PRODUCT_IMAGE_VARIANT.THUMB_100]: `${dir}${PRODUCT_IMAGE_VARIANT.THUMB_100}_${stem}.webp`,
    [PRODUCT_IMAGE_VARIANT.THUMB_400]: `${dir}${PRODUCT_IMAGE_VARIANT.THUMB_400}_${stem}.webp`,
  };
}

/**
 * Resolve primary URL for a variant (does not include fallback steps).
 * @param {string} src Original product image URL from DB
 * @param {string} variant
 * @param {{ shopId?: number|string, partNumber?: string }} [ctx]
 */
export function getProductImageUrl(
  src,
  variant = PRODUCT_IMAGE_VARIANT.ORIGINAL,
  ctx = {},
) {
  const original = normalizeProductMediaUrl(src, ctx);
  if (!original) return "";

  if (variant === PRODUCT_IMAGE_VARIANT.ORIGINAL) {
    return original;
  }

  const thumbs = deriveProductThumbnailCandidates(original, ctx);
  if (variant === PRODUCT_IMAGE_VARIANT.THUMB_100) {
    return thumbs[PRODUCT_IMAGE_VARIANT.THUMB_100] || "";
  }
  if (variant === PRODUCT_IMAGE_VARIANT.THUMB_400) {
    return thumbs[PRODUCT_IMAGE_VARIANT.THUMB_400] || "";
  }

  return original;
}

/**
 * Ordered fallback chain for AppImage.
 *
 * Thumb variants:
 * - allowOriginalFallback true (detail): thumb → original R2 → placeholder
 * - allowOriginalFallback false (listing): thumb → placeholder only
 *
 * @param {string} src
 * @param {string} variant
 * @param {{ allowOriginalFallback?: boolean, shopId?: number|string, partNumber?: string }} [opts]
 */
export function getProductImageFallbackChain(
  src,
  variant = PRODUCT_IMAGE_VARIANT.ORIGINAL,
  opts = {},
) {
  const allowOriginalFallback = opts.allowOriginalFallback === true;
  const original = normalizeProductMediaUrl(src, opts);
  const placeholder = PRODUCT_IMAGE_PLACEHOLDER;

  const dedupe = (list) => {
    const out = [];
    for (const item of list) {
      const v = trimUrl(item);
      if (!v) continue;
      if (isLegacyLocalThumbUrl(v)) continue;
      if (!out.includes(v)) out.push(v);
    }
    return out;
  };

  if (!original) {
    return [placeholder];
  }

  if (variant === PRODUCT_IMAGE_VARIANT.ORIGINAL) {
    return dedupe([original, placeholder]);
  }

  const primary = getProductImageUrl(original, variant, opts);
  const chain = [];

  if (primary) chain.push(primary);

  if (allowOriginalFallback && original !== primary) {
    chain.push(original);
  }

  if (!chain.includes(placeholder)) {
    chain.push(placeholder);
  }

  return dedupe(chain.length ? chain : [placeholder]);
}
