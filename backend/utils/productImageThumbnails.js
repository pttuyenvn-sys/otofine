/**
 * Product thumbnail generation — original + thumb_400 + thumb_100 on R2.
 * Key convention: shops/{shopId}/{stem}.webp → shops/{shopId}/thumb_{variant}_{stem}.webp
 */
import sharp from "sharp";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const PRODUCT_THUMB_VARIANT = {
  MEDIUM: "thumb_400",
  SMALL: "thumb_100",
};

const THUMB_QUALITY = {
  [PRODUCT_THUMB_VARIANT.MEDIUM]: 74,
  [PRODUCT_THUMB_VARIANT.SMALL]: 62,
};

/** @param {string} filename e.g. 9806411580.webp */
export function productImageFilenameStem(filename) {
  const base =
    String(filename || "")
      .replace(/^\/+/, "")
      .split("/")
      .pop()
      ?.split("?")[0] || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base;
  return base.slice(0, dot);
}

/**
 * @param {string} originalKeyOrPath shops/25/9806411580.webp
 * @param {string} variant thumb_400 | thumb_100
 */
export function buildProductThumbKey(originalKeyOrPath, variant) {
  const clean = String(originalKeyOrPath || "").replace(/^\/+/, "");
  const idx = clean.lastIndexOf("/");
  const dir = idx >= 0 ? clean.slice(0, idx + 1) : "";
  const fname = idx >= 0 ? clean.slice(idx + 1) : clean;

  if (!fname || fname.startsWith("thumb_")) {
    return clean;
  }

  const stem = productImageFilenameStem(fname);
  return `${dir}${variant}_${stem}.webp`;
}

/**
 * @param {string} originalKeyOrPath
 * @returns {{ original: string, medium: string, small: string }}
 */
export function deriveProductThumbKeys(originalKeyOrPath) {
  const original = String(originalKeyOrPath || "").replace(/^\/+/, "");
  return {
    original,
    medium: buildProductThumbKey(original, PRODUCT_THUMB_VARIANT.MEDIUM),
    small: buildProductThumbKey(original, PRODUCT_THUMB_VARIANT.SMALL),
  };
}

/**
 * @param {Buffer} webpBuf — watermarked original WebP
 * @returns {Promise<{ medium: Buffer, small: Buffer } | null>}
 */
export async function generateProductThumbnailBuffers(webpBuf) {
  if (!webpBuf?.length) return null;

  const [medium, small] = await Promise.all([
    sharp(webpBuf)
      .resize({
        width: 400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: THUMB_QUALITY[PRODUCT_THUMB_VARIANT.MEDIUM] })
      .toBuffer(),
    sharp(webpBuf)
      .resize({
        width: 100,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: THUMB_QUALITY[PRODUCT_THUMB_VARIANT.SMALL] })
      .toBuffer(),
  ]);

  return { medium, small };
}

/**
 * Upload original + thumb_400 + thumb_100 to R2.
 * @param {{ r2: import("@aws-sdk/client-s3").S3Client, bucket: string, originalKey: string, originalBuffer: Buffer }}
 */
export async function uploadProductImageSet({
  r2,
  bucket,
  originalKey,
  originalBuffer,
}) {
  if (!r2 || !bucket || !originalKey || !originalBuffer?.length) {
    throw new Error("uploadProductImageSet: missing r2, bucket, key, or buffer");
  }

  const thumbs = await generateProductThumbnailBuffers(originalBuffer);
  if (!thumbs?.medium?.length || !thumbs?.small?.length) {
    throw new Error("uploadProductImageSet: thumbnail generation failed");
  }

  const { medium, small } = deriveProductThumbKeys(originalKey);

  const uploads = [
    { key: originalKey, body: originalBuffer },
    { key: medium, body: thumbs.medium },
    { key: small, body: thumbs.small },
  ];

  await Promise.all(
    uploads.map(({ key, body }) =>
      r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: "image/webp",
        }),
      ),
    ),
  );

  return { originalKey, mediumKey: medium, smallKey: small };
}

/**
 * Delete original + derived thumb keys from R2 (best-effort per key).
 */
export async function deleteProductImageSidecars({ r2, bucket, originalKey }) {
  if (!r2 || !bucket || !originalKey) return;

  const keys = deriveProductThumbKeys(originalKey);
  const unique = [...new Set([keys.original, keys.medium, keys.small])];

  await Promise.all(
    unique.map(async (key) => {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
      } catch (err) {
        console.error("[deleteProductImageSidecars] R2 delete error:", key, err.message);
      }
    }),
  );
}
