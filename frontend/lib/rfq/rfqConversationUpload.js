import { API_BASE } from "@/lib/config";
import {
  RFQ_UPLOAD_ACCEPT,
  RFQ_UPLOAD_MAX_BYTES,
  isRfqUploadMime,
  rfqUploadSizeOk,
} from "@/lib/rfq/rfqUploadImage";

export { RFQ_UPLOAD_ACCEPT, RFQ_UPLOAD_MAX_BYTES, isRfqUploadMime, rfqUploadSizeOk };

export const RFQ_CHAT_MAX_IMAGES_PER_MESSAGE = 6;

const UPLOAD_TIMEOUT_MS = 90_000;

/**
 * POST /api/rfq/conversations/:dispatchId/upload-image
 * Returns { attachmentId, url }
 */
export async function uploadConversationImage(file, dispatchId, { headers = {} } = {}) {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API_BASE}/rfq/conversations/${dispatchId}/upload-image`, {
    method: "POST",
    headers: { ...headers },
    body: fd,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });

  let body = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const err = new Error(body?.message || body?.code || `UPLOAD_${res.status}`);
    err.status = res.status;
    err.code = body?.code;
    throw err;
  }

  if (!body?.attachmentId || !body?.url) {
    throw new Error("UPLOAD_NO_URL");
  }

  return {
    attachmentId: Number(body.attachmentId),
    url: body.url,
    thumbnails: body.thumbnails || null,
  };
}
