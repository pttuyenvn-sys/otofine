/** Shared RFQ media URL helpers — legacy local paths + R2/CDN absolute URLs. */
import { rfqR2Config } from "../../../config/rfqR2.config.js";
import { rfqMediaFilenameStem } from "./rfqImageThumbnails.js";

const LEGACY_RFQ_UPLOADS_RE = /\/uploads\/rfq\/([^/?#]+)$/i;
const RFQ_R2_CATEGORIES = ["chat", "request"];
const RFQ_R2_MONTH_LOOKBACK = 12;
const RESOLVE_CACHE_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { url: string, at: number }>} */
const resolveCache = new Map();

export function isAbsoluteMediaUrl(url) {
  const u = String(url || "").trim();
  return u.startsWith("http://") || u.startsWith("https://");
}

export function isLegacyLocalRfqUrl(url) {
  return String(url || "").trim().startsWith("/uploads/rfq/");
}

export function isRfqR2PublicUrl(url) {
  const base = String(rfqR2Config.publicBaseUrl || "").replace(/\/+$/, "");
  const u = String(url || "").trim();
  if (!base || !u) return false;
  return u.startsWith(`${base}/`);
}

/** Legacy absolute URL on apex/static host, e.g. https://otofine.com/uploads/rfq/x.jpg */
export function isLegacyApexRfqUrl(url) {
  const u = String(url || "").trim();
  if (!isAbsoluteMediaUrl(u)) return false;
  return LEGACY_RFQ_UPLOADS_RE.test(u.split("?")[0]);
}

export function isLegacyRfqMediaUrl(url) {
  return isLegacyLocalRfqUrl(url) || isLegacyApexRfqUrl(url);
}

export function filenameFromMediaUrl(url) {
  return String(url || "").split("/").pop()?.split("?")[0]?.toLowerCase() || "";
}

/** Extract original filename from legacy local or apex RFQ upload paths. */
export function extractLegacyRfqFilename(url) {
  const u = String(url || "").trim();
  if (!u) return "";

  if (isLegacyLocalRfqUrl(u)) {
    return filenameFromMediaUrl(u);
  }

  const match = u.split("?")[0].match(LEGACY_RFQ_UPLOADS_RE);
  return match?.[1]?.toLowerCase() || "";
}

/**
 * Deterministic R2 CDN URL candidates for a flat legacy filename.
 * Newest month first; both chat + request categories; 12-month lookback.
 * @param {string} filename
 * @returns {string[]}
 */
export function buildPossibleRfqR2Urls(filename) {
  const fname = String(filename || "").trim().toLowerCase();
  if (!fname || fname.startsWith("thumb_100_") || fname.startsWith("thumb_400_")) {
    return [];
  }

  const base = String(rfqR2Config.publicBaseUrl || "").replace(/\/+$/, "");
  const prefix = String(rfqR2Config.keyPrefix || "rfq").replace(/^\/+|\/+$/g, "");
  if (!base || !prefix) return [];

  const urls = [];
  const anchor = new Date();

  for (let i = 0; i < RFQ_R2_MONTH_LOOKBACK; i += 1) {
    const d = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1),
    );
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    for (const category of RFQ_R2_CATEGORIES) {
      urls.push(`${base}/${prefix}/${category}/${year}/${month}/${fname}`);
    }
  }

  return urls;
}

/**
 * Read-time legacy → R2 rewrite (sync best-effort).
 * Never throws; preserves original when rewrite is not possible.
 */
export function canonicalizeRfqMediaUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";

  if (isRfqR2PublicUrl(raw)) return raw;
  if (isAbsoluteMediaUrl(raw) && !isLegacyRfqMediaUrl(raw)) return raw;

  const fname = extractLegacyRfqFilename(raw);
  if (!fname) return raw;

  const candidates = buildPossibleRfqR2Urls(fname);
  if (!candidates.length) return raw;

  return candidates[0];
}

/** Canonicalize a list of RFQ image URLs (read-time only). */
export function canonicalizeRfqMediaUrlList(urls) {
  if (!Array.isArray(urls)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of urls) {
    const u = canonicalizeRfqMediaUrl(String(raw || "").trim());
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function readResolveCache(raw) {
  const hit = resolveCache.get(raw);
  if (!hit) return null;
  if (Date.now() - hit.at > RESOLVE_CACHE_TTL_MS) {
    resolveCache.delete(raw);
    return null;
  }
  return hit.url;
}

function writeResolveCache(raw, resolved) {
  resolveCache.set(raw, { url: resolved, at: Date.now() });
}

/**
 * Async read-time resolver — probes deterministic R2 candidates via HEAD.
 * Falls back to original URL when no candidate exists publicly.
 */
export async function resolveCanonicalRfqMediaUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";

  if (isRfqR2PublicUrl(raw)) return raw;
  if (isAbsoluteMediaUrl(raw) && !isLegacyRfqMediaUrl(raw)) return raw;

  const cached = readResolveCache(raw);
  if (cached != null) return cached;

  const fname = extractLegacyRfqFilename(raw);
  if (!fname) {
    writeResolveCache(raw, raw);
    return raw;
  }

  const candidates = buildPossibleRfqR2Urls(fname);
  if (!candidates.length) {
    writeResolveCache(raw, raw);
    return raw;
  }

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        method: "HEAD",
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        writeResolveCache(raw, candidate);
        return candidate;
      }
    } catch {
      /* try next candidate */
    }
  }

  writeResolveCache(raw, raw);
  return raw;
}

/** Resolve a list of RFQ image URLs (read-time). */
export async function resolveCanonicalRfqMediaUrlList(urls) {
  if (!Array.isArray(urls)) return [];
  const resolved = await Promise.all(
    urls.map((u) => resolveCanonicalRfqMediaUrl(String(u || "").trim())),
  );
  const out = [];
  const seen = new Set();
  for (const u of resolved) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

const EMPTY_CANDIDATES = {
  medium: { webp: null, jpg: null },
  small: { webp: null, jpg: null },
};

/**
 * Dual-era thumbnail candidates from original URL (no DB required).
 * @returns {{ medium: { webp: string|null, jpg: string|null }, small: { webp: string|null, jpg: string|null } }}
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

/** Preferred derive — WebP first, JPEG fallback (backward compatible single URL). */
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

/** Resolve thumbnails: explicit from upload, else WebP-preferred derive. */
export function resolveRfqThumbnailSet(originalUrl, explicit = null) {
  const c = deriveRfqThumbnailCandidates(originalUrl);
  return {
    small: preferredVariantUrl(c.small, explicit?.small),
    medium: preferredVariantUrl(c.medium, explicit?.medium),
  };
}

/** Phase 6C — enrich API attachment with derived thumbnail URLs; original url unchanged. */
export function enrichRfqAttachmentMedia(attachment) {
  let url = String(attachment?.url || "").trim();
  if (!url) return attachment;
  if (isLegacyRfqMediaUrl(url)) {
    url = canonicalizeRfqMediaUrl(url);
  }
  const thumbnails = resolveRfqThumbnailSet(url, attachment?.thumbnails);
  return {
    ...attachment,
    url,
    thumbnails: {
      small: thumbnails.small,
      medium: thumbnails.medium,
    },
  };
}

export function buildRfqImageUploadResponse(saved) {
  const url = String(saved?.url || "").trim();
  const thumbnails = resolveRfqThumbnailSet(url, saved?.thumbnails);
  return {
    url,
    thumbnails: {
      small: thumbnails.small,
      medium: thumbnails.medium,
    },
  };
}

function mediaUrlRank(url) {
  if (isAbsoluteMediaUrl(url)) return 2;
  if (isLegacyLocalRfqUrl(url)) return 1;
  return 0;
}

/**
 * Merge image URL lists; when the same filename exists as local + R2, prefer R2.
 */
export function mergeRfqImageUrlLists(existingJson, incomingUrls) {
  let prev = [];
  try {
    prev =
      typeof existingJson === "string"
        ? JSON.parse(existingJson)
        : Array.isArray(existingJson)
          ? existingJson
          : [];
  } catch {
    prev = [];
  }
  const incoming = Array.isArray(incomingUrls) ? incomingUrls : [];
  const byFilename = new Map();
  const unkeyed = [];

  for (const raw of [...prev, ...incoming]) {
    const url = String(raw || "").trim();
    if (!url) continue;
    const fname = filenameFromMediaUrl(url);
    if (!fname) {
      unkeyed.push(url);
      continue;
    }
    const existing = byFilename.get(fname);
    if (!existing || mediaUrlRank(url) > mediaUrlRank(existing)) {
      byFilename.set(fname, url);
    }
  }

  const seen = new Set();
  const out = [];
  for (const url of [...byFilename.values(), ...unkeyed]) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * URL returned to API/DB — must be absolute R2/CDN URL.
 */
export function pickPersistedPublicUrl(persistResult) {
  if (!persistResult?.url) {
    throw Object.assign(new Error("RFQ_PERSIST_EMPTY"), { status: 500 });
  }
  const publicUrl = persistResult.publicUrl || persistResult.url;
  if (!isAbsoluteMediaUrl(publicUrl)) {
    throw Object.assign(new Error("RFQ_R2_BAD_PUBLIC_URL"), {
      status: 500,
      got: publicUrl,
    });
  }
  return publicUrl;
}
