import sharp from "sharp";
import { rfqImageLimits, rfqUploadMaxBytes } from "../../../config/rfq.config.js";

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

/**
 * Decode → megapixel guard → bounded resize → JPEG (strip metadata via recompression).
 * Aligns with production-safe sharp usage in product pipeline; RFQ stays under uploads/rfq/.
 */
export async function processRfqGuestUpload(buffer) {
  if (!buffer?.length) {
    throw Object.assign(new Error("MISSING_FILE"), { status: 400 });
  }
  if (buffer.length > rfqUploadMaxBytes) {
    throw Object.assign(new Error("UPLOAD_TOO_LARGE"), { status: 400 });
  }

  let meta;
  try {
    meta = await sharp(buffer).rotate().metadata();
  } catch {
    throw Object.assign(new Error("INVALID_IMAGE"), { status: 400 });
  }

  const fmt = meta.format;
  if (!fmt || !ALLOWED_FORMATS.has(fmt)) {
    throw Object.assign(new Error("INVALID_IMAGE"), { status: 400 });
  }

  const w = meta.width || 0;
  const h = meta.height || 0;
  const mp = (w * h) / 1e6;
  if (mp > rfqImageLimits.maxMegapixels) {
    throw Object.assign(new Error("IMAGE_TOO_LARGE"), { status: 400 });
  }

  let pipeline = sharp(buffer).rotate();

  if (w > rfqImageLimits.maxWidth || h > rfqImageLimits.maxHeight) {
    pipeline = pipeline.resize({
      width: rfqImageLimits.maxWidth,
      height: rfqImageLimits.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  try {
    return await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch {
    throw Object.assign(new Error("INVALID_IMAGE"), { status: 400 });
  }
}
