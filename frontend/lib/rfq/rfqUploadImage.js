import { API_BASE } from "@/lib/config";

export const RFQ_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp";
export const RFQ_UPLOAD_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Align with backend RFQ_UPLOAD_MAX_BYTES default (5MB). */
export const RFQ_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export function isRfqUploadMime(file) {
  return RFQ_UPLOAD_MIME.has(file?.type);
}

export function rfqUploadSizeOk(file) {
  return file && file.size > 0 && file.size <= RFQ_UPLOAD_MAX_BYTES;
}

/**
 * POST /api/rfq/upload-image — multipart field `file`, body `publicId`.
 * Response: { url: "/uploads/rfq/<uuid>.jpg" } (unchanged contract).
 */
const UPLOAD_TIMEOUT_MS = 90_000;

export async function uploadRfqImage(file, publicId) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("publicId", String(publicId || "").trim());

  const url = `${API_BASE}/rfq/upload-image`;
  if (typeof console !== "undefined" && console.debug) {
    console.debug("[rfq-upload] POST", url, { publicId, size: file?.size, type: file?.type });
  }

  const res = await fetch(url, {
    method: "POST",
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
    let code = body?.code || `UPLOAD_${res.status}`;
    let message = body?.message;
    if (res.status === 413) {
      code = "UPLOAD_TOO_LARGE";
      message =
        message ||
        "Ảnh quá lớn hoặc mạng bị giới hạn — thử ảnh nhỏ hơn hoặc tải từng ảnh.";
    }
    const err = new Error(message || code);
    err.status = res.status;
    err.code = code;
    throw err;
  }

  if (typeof console !== "undefined" && console.debug) {
    console.debug("[rfq-upload] OK", body?.url);
  }

  const uploadedUrl = body?.url;

  if (!uploadedUrl) throw new Error("UPLOAD_NO_URL");

  return {
    url: uploadedUrl,
  };
}
