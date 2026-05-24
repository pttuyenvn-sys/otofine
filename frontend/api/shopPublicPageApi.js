import axios from "axios";
import { API_BASE } from "../lib/config";

/**
 * API client for the seller's "Public Page" management section.
 * Wraps the /api/shop/public-page endpoints. Reuses the localStorage
 * token convention from the rest of the seller-center clients
 * (see api/shopApi.js).
 */
const API = axios.create({ baseURL: API_BASE });

API.interceptors.request.use((req) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

export function getMyPublicPage() {
  return API.get("/shop/public-page");
}

export function updateMyPublicPage(payload) {
  return API.put("/shop/public-page", payload);
}

export function checkSlugAvailability(slug) {
  return API.get("/shop/public-page/check-slug", { params: { slug } });
}

export function uploadAvatar(file) {
  const fd = new FormData();
  fd.append("file", file);
  return API.post("/shop/public-page/upload-avatar", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function uploadCover(file) {
  const fd = new FormData();
  fd.append("file", file);
  return API.post("/shop/public-page/upload-cover", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export default API;
