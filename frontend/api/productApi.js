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

export const getProductsByShop = () => API.get("/products");
export const addProduct = (formData) =>
  API.post("/products", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
