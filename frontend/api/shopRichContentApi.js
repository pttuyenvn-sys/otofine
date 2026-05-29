import axiosClient from "@/api/axiosClient";

/**
 * API client for inline-image uploads from the rich storefront editor.
 * Reuses the centralized axiosClient which handles auth + refresh.
 */
export function uploadContentImage(file, onProgress) {
  const fd = new FormData();
  fd.append("file", file);
  return axiosClient.post("/shop/public-page/upload-content", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (!onProgress || !e.total) return;
      onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
}
