import axios from "axios";
import { API_BASE } from "../lib/config";

const API = axios.create({
  baseURL: API_BASE,
});

API.interceptors.request.use((config) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const getBrands = () => API.get("/car/brands");

export const getModelsByBrand = (brand) =>
  API.get("/car/models", { params: { brand } });
