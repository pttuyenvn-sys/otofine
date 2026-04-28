import axios from "axios";
import { API_BASE } from "../lib/config";

const API = axios.create({
  baseURL: API_BASE,
});

API.interceptors.request.use((req) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

export const getBrands = () => API.get("/car/brands");

export const getModelsByBrand = (brand) =>
  API.get("/car/models", { params: { brand } });

export const getMyShop = () => API.get("/shop/me");

export const updateMyShop = (data) =>
  API.put("/shop/me", data, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const createShop = (data) =>
  API.post("/shop", data, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const uploadEditorImage = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return API.post("/shop/upload-editor", fd);
};

export default API;
