import axios from "axios";
import { API_ORIGIN } from "../lib/config";

const API = axios.create({
  baseURL: `${API_ORIGIN}/api/admin`,
});

API.interceptors.request.use((req) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

export const getShops = () => API.get("/shops");

export const updateShopStatus = (id, status) =>
  API.patch(`/shops/${id}/status`, { status });

export const deleteShop = (id) => API.delete(`/shops/${id}`);

/** Otofine Knowledge Engine — /api/admin/part-knowledge */
export const listPartKnowledge = (params) =>
  API.get("/part-knowledge", { params });

export const getPartKnowledge = (id) => API.get(`/part-knowledge/${id}`);

export const createPartKnowledge = (body) => API.post("/part-knowledge", body);

export const updatePartKnowledge = (id, body) =>
  API.patch(`/part-knowledge/${id}`, body);

export const deletePartKnowledge = (id) => API.delete(`/part-knowledge/${id}`);

/** Batch 1 JSON: { rows: [{ slug, category_name, english_name, ... }] } */
export const importPartKnowledgeBatch1 = (body) =>
  API.post("/part-knowledge/import-batch1", body);
