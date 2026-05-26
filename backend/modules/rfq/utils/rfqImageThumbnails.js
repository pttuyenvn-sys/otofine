/**
 * RFQ thumbnail generation — original + thumb_400 + thumb_100.
 * Key convention: same directory as original, prefix thumb_{variant}_{stem}.webp
 */
import sharp from "sharp";
import {
  rfqThumbnailsEnabled,
  rfqThumbsWebpEnabled,
} from "../../../config/rfq.config.js";

export const RFQ_THUMB_VARIANT = {
  MEDIUM: "thumb_400",
  SMALL: "thumb_100",
};

const THUMB_QUALITY = {
  [RFQ_THUMB_VARIANT.MEDIUM]: 72,
  [RFQ_THUMB_VARIANT.SMALL]: 60,
};

/** @param {string} filename e.g. abc.jpg */
export function rfqMediaFilenameStem(filename) {
  const base = String(filename || "")
    .replace(/^\/+/, "")
    .split("/")
    .pop()
    ?.split("?")[0] || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base;
  return base.slice(0, dot);
}

export function rfqThumbContentType() {
  return rfqThumbsWebpEnabled() ? "image/webp" : "image/jpeg";
}

/**
 * @param {string} variant thumb_400 | thumb_100
 * @param {string} originalFilename e.g. abc.jpg
 */
export function rfqThumbFilename(variant, originalFilename) {
  const base = String(originalFilename || "")
    .replace(/^\/+/, "")
    .split("/")
    .pop()
    ?.split("?")[0] || "";
  if (!base || base.startsWith("thumb_")) return base;

  if (rfqThumbsWebpEnabled()) {
    const stem = rfqMediaFilenameStem(base);
    return `${variant}_${stem}.webp`;
  }

  // Rollback: legacy JPEG thumb naming (thumb_400_abc.jpg)
  return `${variant}_${base}`;
}

/**
 * R2 object path: rfq/chat/2026/05/abc.jpg → rfq/chat/2026/05/thumb_400_abc.webp
 * @param {string} originalKeyOrPath
 */
export function buildRfqThumbPath(originalKeyOrPath, variant) {
  const clean = String(originalKeyOrPath || "").replace(/^\/+/, "");
  const idx = clean.lastIndexOf("/");
  if (idx < 0) return rfqThumbFilename(variant, clean);
  const dir = clean.slice(0, idx + 1);
  const fname = clean.slice(idx + 1);
  return `${dir}${rfqThumbFilename(variant, fname)}`;
}

async function encodeThumbBuffer(jpegBuf, variant, resize) {
  let img = sharp(jpegBuf).rotate().resize(resize);
  if (rfqThumbsWebpEnabled()) {
    return img.webp({ quality: THUMB_QUALITY[variant] }).toBuffer();
  }
  return img.jpeg({ quality: THUMB_QUALITY[variant], mozjpeg: true }).toBuffer();
}

/**
 * @param {Buffer} jpegBuf — processed RFQ JPEG
 * @returns {Promise<{ medium: Buffer, small: Buffer } | null>}
 */
export async function generateRfqThumbnailBuffers(jpegBuf) {
  if (!rfqThumbnailsEnabled() || !jpegBuf?.length) return null;

  const [medium, small] = await Promise.all([
    encodeThumbBuffer(jpegBuf, RFQ_THUMB_VARIANT.MEDIUM, {
      width: 400,
      fit: "inside",
      withoutEnlargement: true,
    }),
    encodeThumbBuffer(jpegBuf, RFQ_THUMB_VARIANT.SMALL, {
      width: 100,
      height: 100,
      fit: "cover",
    }),
  ]);

  return { medium, small };
}

/**
 * Always WebP — for backfill jobs (ignores RFQ_THUMBS_WEBP_ENABLED).
 * @param {Buffer} jpegBuf
 * @returns {Promise<{ medium: Buffer, small: Buffer } | null>}
 */
export async function generateRfqWebpThumbnailBuffers(jpegBuf) {
  if (!jpegBuf?.length) return null;

  const encodeWebp = (buf, variant, resize) =>
    sharp(buf)
      .rotate()
      .resize(resize)
      .webp({ quality: THUMB_QUALITY[variant] })
      .toBuffer();

  const [medium, small] = await Promise.all([
    encodeWebp(jpegBuf, RFQ_THUMB_VARIANT.MEDIUM, {
      width: 400,
      fit: "inside",
      withoutEnlargement: true,
    }),
    encodeWebp(jpegBuf, RFQ_THUMB_VARIANT.SMALL, {
      width: 100,
      height: 100,
      fit: "cover",
    }),
  ]);

  return { medium, small };
}

/** WebP thumb object key — independent of RFQ_THUMBS_WEBP_ENABLED flag. */
export function buildRfqWebpThumbPath(originalKeyOrPath, variant) {
  const clean = String(originalKeyOrPath || "").replace(/^\/+/, "");
  const idx = clean.lastIndexOf("/");
  const fname = idx >= 0 ? clean.slice(idx + 1) : clean;
  const dir = idx >= 0 ? clean.slice(0, idx + 1) : "";
  const stem = rfqMediaFilenameStem(fname);
  return `${dir}${variant}_${stem}.webp`;
}

/** Legacy JPEG thumb key (for size comparison / logging only). */
export function buildRfqLegacyJpegThumbPath(originalKeyOrPath, variant) {
  const clean = String(originalKeyOrPath || "").replace(/^\/+/, "");
  const idx = clean.lastIndexOf("/");
  const fname = idx >= 0 ? clean.slice(idx + 1) : clean;
  const dir = idx >= 0 ? clean.slice(0, idx + 1) : "";
  return `${dir}${variant}_${fname}`;
}
