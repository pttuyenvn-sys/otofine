/** Legacy filesystem thumb paths from pre-R2 catalog imports. */
export const LEGACY_PRODUCT_THUMB_PATH = "/images/thumbs/";

const LEGACY_THUMB_PATH_RE = /\/images\/thumbs\//i;

function trimUrl(raw) {
  const u = String(raw ?? "").trim();
  if (!u || u === "undefined" || u === "null") return "";
  return u;
}

export function isLegacyLocalThumbUrl(url) {
  const u = trimUrl(url).split("?")[0];
  return Boolean(u && LEGACY_THUMB_PATH_RE.test(u));
}

/**
 * Legacy filename: 0052226_96210A9000SWP.png → part number after first underscore.
 */
export function extractPartNumberFromLegacyThumbUrl(url) {
  const fname = String(url || "")
    .split("/")
    .pop()
    ?.split("?")[0] || "";
  const match = fname.match(/^[0-9]+_(.+)\.[a-z0-9]+$/i);
  return match?.[1]?.trim() || "";
}

export function buildR2ProductOriginalUrl({ shopId, partNumber }) {
  const base = (process.env.R2_PUBLIC_URL || "https://img.otofine.com").replace(
    /\/+$/,
    "",
  );
  const pn = String(partNumber || "")
    .trim()
    .toUpperCase();
  const sid = Number(shopId);
  if (!pn || !Number.isFinite(sid) || sid <= 0) return "";
  return `${base}/shops/${sid}/${pn}.webp`;
}

/**
 * Rewrite a legacy thumb URL to canonical R2 original, or "" to block broken paths.
 */
export function resolveLegacyThumbToOriginal(url, ctx = {}) {
  if (!isLegacyLocalThumbUrl(url)) return trimUrl(url).split("?")[0];

  const partNumber =
    String(ctx.partNumber || "").trim() ||
    extractPartNumberFromLegacyThumbUrl(url);
  const original = buildR2ProductOriginalUrl({
    shopId: ctx.shopId,
    partNumber,
  });
  return original || "";
}

/** Stabilize catalog media URL — never pass through broken legacy thumb paths. */
export function stabilizeLegacyProductMediaUrl(url, ctx = {}) {
  const u = trimUrl(url);
  if (!u) return "";
  if (!isLegacyLocalThumbUrl(u)) return u.split("?")[0];
  return resolveLegacyThumbToOriginal(u, ctx);
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
