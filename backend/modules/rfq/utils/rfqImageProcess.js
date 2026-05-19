import sharp from "sharp";
import { rfqImageLimits, rfqUploadMaxBytes } from "../../../config/rfq.config.js";
import { rfqLog } from "./rfqLogger.js";

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

/**
 * RFQ guest image pipeline — backend is the source of truth for optimization.
 *
 * Mobile buyers often upload 3–12MP photos straight from the camera roll (multi‑MB each).
 * Frontend must not be relied on to resize: browsers differ and uploads are anonymous.
 *
 * Strategy: EXIF-aware rotate → cap long edge via max width (default 1600px, no upscale) →
 * JPEG re-encode (mozjpeg, quality ~78) which strips metadata and typically lands outputs
 * in ~200–600KB for shop review (part labels, registration text, VIN stickers).
 */
export async function processRfqGuestUpload(buffer) {
  if (!buffer?.length) {
    throw Object.assign(new Error("MISSING_FILE"), { status: 400 });
  }

  const originalBytes = buffer.length;

  if (originalBytes > rfqUploadMaxBytes) {
    throw Object.assign(new Error("UPLOAD_TOO_LARGE"), { status: 400 });
  }

  const maxWidth = rfqImageLimits.maxWidth;

  let image;
  try {
    image = sharp(buffer).rotate();
  } catch {
    throw Object.assign(new Error("INVALID_IMAGE"), { status: 400 });
  }

  let meta;
  try {
    meta = await image.metadata();
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

  let optimized;
  try {
    optimized = await image
      .resize({
        width: maxWidth,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: rfqImageLimits.jpegQuality,
        mozjpeg: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();
  } catch {
    throw Object.assign(new Error("INVALID_IMAGE"), { status: 400 });
  }

  const optimizedBytes = optimized.length;
  const reductionRatio =
    originalBytes > 0
      ? Number(((originalBytes - optimizedBytes) / originalBytes).toFixed(3))
      : 0;

  rfqLog.metric("rfq.upload.image_optimized", {
    original_bytes: originalBytes,
    optimized_bytes: optimizedBytes,
    reduction_ratio: reductionRatio,
    input_width: w,
    input_height: h,
    output_max_width: maxWidth,
    jpeg_quality: rfqImageLimits.jpegQuality,
  });

  return optimized;
}
