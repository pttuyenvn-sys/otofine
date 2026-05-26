/**
 * RFQ image persist — R2-only pipeline.
 * upload → sharp → thumbnails → R2 → CDN URL
 */
import crypto from "crypto";
import { rfqR2Ready } from "../../../config/rfqR2.config.js";
import { uploadBufferToR2, buildR2PublicUrl } from "../../../services/rfqR2Upload.service.js";
import { processRfqGuestUpload } from "./rfqImageProcess.js";
import { buildRfqR2ObjectKey } from "./rfqR2Keys.js";
import {
  pickPersistedPublicUrl,
  resolveRfqThumbnailSet,
} from "./rfqImageUrls.js";
import {
  generateRfqThumbnailBuffers,
  buildRfqThumbPath,
  rfqThumbContentType,
  RFQ_THUMB_VARIANT,
} from "./rfqImageThumbnails.js";
import {
  recordRfqPrimaryFailed,
  recordRfqPrimaryUploaded,
} from "./rfqR2Observability.js";
import { rfqLog } from "./rfqLogger.js";

const R2_UPLOAD_TIMEOUT_MS = Math.max(
  3000,
  Number(process.env.RFQ_R2_UPLOAD_TIMEOUT_MS || 15000),
);

async function uploadR2WithTimeout(buffer, key, contentType) {
  const work = uploadBufferToR2(buffer, { key, contentType });
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("RFQ_R2_TIMEOUT")), R2_UPLOAD_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]);
}

async function uploadR2ImageSet(jpegBuf, r2Key, thumbs) {
  const thumbContentType = rfqThumbContentType();
  const uploads = [{ buffer: jpegBuf, key: r2Key, contentType: "image/jpeg" }];
  if (thumbs?.medium?.length) {
    uploads.push({
      buffer: thumbs.medium,
      key: buildRfqThumbPath(r2Key, RFQ_THUMB_VARIANT.MEDIUM),
      contentType: thumbContentType,
    });
  }
  if (thumbs?.small?.length) {
    uploads.push({
      buffer: thumbs.small,
      key: buildRfqThumbPath(r2Key, RFQ_THUMB_VARIANT.SMALL),
      contentType: thumbContentType,
    });
  }

  const results = await Promise.all(
    uploads.map(({ buffer, key, contentType }) =>
      uploadR2WithTimeout(buffer, key, contentType),
    ),
  );

  const original = results[0];
  const thumbnailUrls = { medium: null, small: null };

  if (thumbs?.medium?.length) {
    thumbnailUrls.medium = buildR2PublicUrl(
      buildRfqThumbPath(r2Key, RFQ_THUMB_VARIANT.MEDIUM),
    );
  }
  if (thumbs?.small?.length) {
    thumbnailUrls.small = buildR2PublicUrl(
      buildRfqThumbPath(r2Key, RFQ_THUMB_VARIANT.SMALL),
    );
  }

  return {
    key: original.key,
    url: original.url,
    byteSize: original.byteSize,
    thumbnails: thumbnailUrls,
  };
}

async function persistRfqProcessedImage(jpegBuf, opts = {}) {
  if (!rfqR2Ready()) {
    throw Object.assign(new Error("RFQ_R2_NOT_CONFIGURED"), { status: 503 });
  }

  const category = opts.category || "chat";
  const requestType = opts.requestType || category;
  const meta = opts.meta || {};
  const debug = opts.debug || {};
  const thumbs = opts.thumbnails || null;

  const filename = `${crypto.randomUUID()}.jpg`.toLowerCase();
  const r2Key = buildRfqR2ObjectKey(category, filename);
  const r2Started = Date.now();

  try {
    const result = await uploadR2ImageSet(jpegBuf, r2Key, thumbs);
    const r2DurationMs = Date.now() - r2Started;

    recordRfqPrimaryUploaded({
      r2_url: result.url,
      r2_key: result.key,
      request_type: requestType,
      category,
      byte_size: result.byteSize,
      r2_duration_ms: r2DurationMs,
      has_thumbnails: Boolean(thumbs),
      ...meta,
      ...debug,
    });

    return {
      url: result.url,
      publicUrl: result.url,
      byte_size: result.byteSize,
      storage: "r2",
      r2_key: result.key,
      thumbnails: result.thumbnails,
    };
  } catch (err) {
    const msg = String(err?.message || err);
    recordRfqPrimaryFailed({
      r2_key: r2Key,
      request_type: requestType,
      category,
      error: msg,
      is_timeout: msg === "RFQ_R2_TIMEOUT",
      r2_duration_ms: Date.now() - r2Started,
      ...meta,
      ...debug,
    });
    throw Object.assign(new Error("RFQ_R2_UPLOAD_FAILED"), {
      status: 503,
      cause: err,
    });
  }
}

/**
 * Full pipeline: raw buffer → sharp → thumbnails → R2.
 */
export async function saveRfqImageBuffer(buffer, opts = {}) {
  if (!rfqR2Ready()) {
    throw Object.assign(new Error("RFQ_R2_NOT_CONFIGURED"), { status: 503 });
  }

  const uploadStarted = Date.now();
  const sharpStarted = Date.now();
  const jpegBuf = await processRfqGuestUpload(buffer);
  const sharpDurationMs = Date.now() - sharpStarted;

  const thumbStarted = Date.now();
  const thumbs = await generateRfqThumbnailBuffers(jpegBuf);
  const thumbDurationMs = Date.now() - thumbStarted;

  const debug = {
    ...(opts.debug || {}),
    mime: opts.mime ?? opts.debug?.mime ?? null,
    input_bytes: opts.input_bytes ?? buffer?.length ?? null,
    sharp_duration_ms: sharpDurationMs,
    thumb_duration_ms: thumbDurationMs,
  };

  const saved = await persistRfqProcessedImage(jpegBuf, {
    category: opts.category || "chat",
    requestType: opts.requestType || opts.category || "chat",
    meta: opts.meta || {},
    thumbnails: thumbs,
    debug: {
      ...debug,
      upload_duration_ms: Date.now() - uploadStarted,
    },
  });

  const url = pickPersistedPublicUrl(saved);
  const thumbnails = resolveRfqThumbnailSet(url, saved.thumbnails);

  rfqLog.info("rfq.image.persisted", {
    url,
    storage: "r2",
    category: opts.category || "chat",
    r2_key: saved.r2_key ?? null,
    has_thumbnails: Boolean(thumbnails.small || thumbnails.medium),
  });

  return {
    url,
    publicUrl: url,
    byte_size: saved.byte_size,
    storage: "r2",
    r2_key: saved.r2_key ?? null,
    thumbnails,
  };
}
