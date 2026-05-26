/** Shared RFQ media URL helpers — legacy local paths + R2/CDN absolute URLs. */
import { rfqMediaFilenameStem } from "./rfqImageThumbnails.js";

export function isAbsoluteMediaUrl(url) {
  const u = String(url || "").trim();
  return u.startsWith("http://") || u.startsWith("https://");
}

export function isLegacyLocalRfqUrl(url) {
  return String(url || "").trim().startsWith("/uploads/rfq/");
}

export function filenameFromMediaUrl(url) {
  return String(url || "").split("/").pop()?.split("?")[0]?.toLowerCase() || "";
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

/** API upload response — backward compatible { url } + optional thumbnails. */
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
