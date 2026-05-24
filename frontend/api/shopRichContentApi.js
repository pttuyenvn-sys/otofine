import axios from "axios";
import { API_BASE } from "../lib/config";

/**
 * API client for inline-image uploads from the rich storefront editor.
 * Reuses the same token + base URL convention as the other shop clients.
 */
const API = axios.create({ baseURL: API_BASE });

API.interceptors.request.use((req) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

/**
 * POST /api/shop/public-page/upload-content
 * Returns { ok, url, width, height } on success.
 */
export function uploadContentImage(file, onProgress) {
  const fd = new FormData();
  fd.append("file", file);
  return API.post("/shop/public-page/upload-content", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (!onProgress || !e.total) return;
      onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
}
