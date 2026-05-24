import sharp from "sharp";

/**
 * Image post-processing for the public-page uploader.
 *
 * Goals:
 *   - Cap dimensions so a seller can't upload a 20 MP JPEG and balloon
 *     R2 + page load weight.
 *   - Convert to WebP — every modern browser supports it; payload
 *     drops 30–70% vs. JPEG for the same visual quality.
 *   - Strip EXIF (sharp does this by default unless `.withMetadata()`
 *     is called) — no GPS leak, no camera fingerprinting.
 *   - Re-validate by actually parsing the input. If `sharp` can't
 *     decode it, the file wasn't actually an image regardless of what
 *     the MIME header claimed — we reject before any R2 write.
 *
 * Constraints (Phase 4.5):
 *   - avatar:  fit inside 512×512, square cover (smart crop), webp@q=80
 *   - cover:   max width 1600 (height proportional), webp@q=82
 *
 * Caller pattern:
 *   const { buffer, key, contentType } = await optimizeAvatar(file.buffer, baseKey);
 *   await uploadToR2(buffer, key, contentType);
 */

const AVATAR_SIZE = 512;
const COVER_MAX_WIDTH = 1600;

async function ensureDecodable(buffer) {
  try {
    const meta = await sharp(buffer, { failOn: "error" }).metadata();
    if (!meta.format || !meta.width || !meta.height) {
      throw new Error("undecodable image");
    }
    return meta;
  } catch (err) {
    const e = new Error("Ảnh không hợp lệ hoặc đã hỏng.");
    e.status = 400;
    e.code = "IMAGE_DECODE_FAILED";
    e.cause = err;
    throw e;
  }
}

export async function optimizeAvatar(inputBuffer, baseKey) {
  const meta = await ensureDecodable(inputBuffer);
  const buffer = await sharp(inputBuffer)
    .rotate()                       // honour EXIF orientation, then strip
    .resize({
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      fit: "cover",
      position: "attention",        // sharp's saliency-aware crop
      withoutEnlargement: true,
    })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
  const key = swapExt(baseKey, "webp");
  return {
    buffer,
    key,
    contentType: "image/webp",
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    bytesIn: inputBuffer.length,
    bytesOut: buffer.length,
    originalFormat: meta.format,
  };
}

export async function optimizeCover(inputBuffer, baseKey) {
  const meta = await ensureDecodable(inputBuffer);
  const buffer = await sharp(inputBuffer)
    .rotate()
    .resize({
      width: COVER_MAX_WIDTH,
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
  const key = swapExt(baseKey, "webp");
  return {
    buffer,
    key,
    contentType: "image/webp",
    bytesIn: inputBuffer.length,
    bytesOut: buffer.length,
    originalFormat: meta.format,
  };
}

function swapExt(key, newExt) {
  const cleaned = String(key).replace(/\.[^./]+$/, "");
  return `${cleaned}.${newExt}`;
}
