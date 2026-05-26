import { saveRfqImageBuffer } from "./rfqImagePersist.js";
import { buildRfqImageUploadResponse } from "./rfqImageUrls.js";

/**
 * Persist optimized JPEG for conversation uploads.
 * R2-only pipeline with optional thumbnails.
 * @returns {{ url: string, byte_size: number, thumbnails?: { small: string|null, medium: string|null } }}
 */
export async function saveConversationImageBuffer(buffer, mirrorMeta = {}) {
  const result = await saveRfqImageBuffer(buffer, {
    category: "chat",
    requestType: "chat",
    mime: mirrorMeta.mime ?? null,
    input_bytes: mirrorMeta.input_bytes ?? buffer?.length ?? null,
    meta: {
      dispatch_id: mirrorMeta.dispatch_id ?? null,
      sender_type: mirrorMeta.sender_type ?? null,
    },
    debug: {
      mime: mirrorMeta.mime ?? null,
      input_bytes: mirrorMeta.input_bytes ?? buffer?.length ?? null,
    },
  });

  const payload = buildRfqImageUploadResponse(result);

  return {
    url: payload.url,
    byte_size: result.byte_size,
    storage: result.storage,
    thumbnails: payload.thumbnails,
  };
}
